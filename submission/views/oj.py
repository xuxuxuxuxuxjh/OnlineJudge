import ipaddress
import os
import requests
from openai import OpenAI

from account.decorators import login_required, check_contest_permission
from contest.models import ContestStatus, ContestRuleType
from judge.tasks import judge_task
from options.options import SysOptions
# from judge.dispatcher import JudgeDispatcher
from problem.models import Problem, ProblemRuleType
from utils.api import APIView, validate_serializer
from utils.cache import cache
from utils.captcha import Captcha
from utils.throttling import TokenBucket
from ..models import Submission
from ..serializers import (CreateSubmissionSerializer, SubmissionModelSerializer,
                           ShareSubmissionSerializer, AIModifyCodeSerializer)
from ..serializers import SubmissionSafeModelSerializer, SubmissionListSerializer

# ============================================================================
# 【改进建议1】：添加智能推荐相关的导入
# ============================================================================
# from collections import defaultdict
# from django.db.models import Count, Avg, Q
# from datetime import datetime, timedelta
# import json


class SubmissionAPI(APIView):
    def throttling(self, request):
        # 使用 open_api 的请求暂不做限制
        auth_method = getattr(request, "auth_method", "")
        if auth_method == "api_key":
            return
        user_bucket = TokenBucket(key=str(request.user.id),
                                  redis_conn=cache, **SysOptions.throttling["user"])
        can_consume, wait = user_bucket.consume()
        if not can_consume:
            return "Please wait %d seconds" % (int(wait))

        # ip_bucket = TokenBucket(key=request.session["ip"],
        #                         redis_conn=cache, **SysOptions.throttling["ip"])
        # can_consume, wait = ip_bucket.consume()
        # if not can_consume:
        #     return "Captcha is required"

    @check_contest_permission(check_type="problems")
    def check_contest_permission(self, request):
        contest = self.contest
        if contest.status == ContestStatus.CONTEST_ENDED:
            return self.error("The contest have ended")
        if not request.user.is_contest_admin(contest):
            user_ip = ipaddress.ip_address(request.session.get("ip"))
            if contest.allowed_ip_ranges:
                if not any(user_ip in ipaddress.ip_network(cidr, strict=False) for cidr in contest.allowed_ip_ranges):
                    return self.error("Your IP is not allowed in this contest")

    @validate_serializer(CreateSubmissionSerializer)
    @login_required
    def post(self, request):
        data = request.data
        hide_id = False
        if data.get("contest_id"):
            error = self.check_contest_permission(request)
            if error:
                return error
            contest = self.contest
            if not contest.problem_details_permission(request.user):
                hide_id = True

        if data.get("captcha"):
            if not Captcha(request).check(data["captcha"]):
                return self.error("Invalid captcha")
        error = self.throttling(request)
        if error:
            return self.error(error)

        try:
            problem = Problem.objects.get(id=data["problem_id"], contest_id=data.get("contest_id"), visible=True)
        except Problem.DoesNotExist:
            return self.error("Problem not exist")
        if data["language"] not in problem.languages:
            return self.error(f"{data['language']} is not allowed in the problem")
        
        # ============================================================================
        # 【改进建议2】：在创建提交时记录更多元数据用于智能分析
        # ============================================================================
        # 建议添加：
        # - submission_start_time: 用户开始做题时间（前端传入）
        # - attempt_count: 该题目的尝试次数
        # - code_length: 代码长度（用于分析代码风格）
        # - 示例实现：
        # attempt_count = Submission.objects.filter(
        #     user_id=request.user.id, 
        #     problem_id=problem.id
        # ).count() + 1
        
        submission = Submission.objects.create(user_id=request.user.id,
                                               username=request.user.username,
                                               language=data["language"],
                                               code=data["code"],
                                               problem_id=problem.id,
                                               ip=request.session["ip"],
                                               contest_id=data.get("contest_id"))
        
        # ============================================================================
        # 【改进建议3】：提交后触发异步任务进行代码特征提取和用户画像更新
        # ============================================================================
        # 建议添加异步任务：
        # from .tasks import extract_code_features, update_user_profile
        # extract_code_features.delay(submission.id)  # 提取代码特征（算法、数据结构等）
        # update_user_profile.delay(request.user.id)  # 更新用户能力画像
        
        # use this for debug
        # JudgeDispatcher(submission.id, problem.id).judge()
        judge_task.send(submission.id, problem.id)
        if hide_id:
            return self.success()
        else:
            return self.success({"submission_id": submission.id})

    @login_required
    def get(self, request):
        submission_id = request.GET.get("id")
        if not submission_id:
            return self.error("Parameter id doesn't exist")
        try:
            submission = Submission.objects.select_related("problem").get(id=submission_id)
        except Submission.DoesNotExist:
            return self.error("Submission doesn't exist")
        if not submission.check_user_permission(request.user):
            return self.error("No permission for this submission")

        if submission.problem.rule_type == ProblemRuleType.OI or request.user.is_admin_role():
            submission_data = SubmissionModelSerializer(submission).data
        else:
            submission_data = SubmissionSafeModelSerializer(submission).data
        # 是否有权限取消共享
        submission_data["can_unshare"] = submission.check_user_permission(request.user, check_share=False)
        
        # ============================================================================
        # 【改进建议4】：在返回提交详情时，附加智能分析结果
        # ============================================================================
        # 建议添加：
        # if hasattr(submission, 'code_features') and submission.code_features:
        #     submission_data["ai_analysis"] = {
        #         "algorithms_used": submission.code_features.get("algorithms", []),
        #         "time_complexity": submission.code_features.get("complexity", "N/A"),
        #         "code_quality_score": submission.code_features.get("quality_score", 0),
        #         "improvement_suggestions": submission.code_features.get("suggestions", [])
        #     }
        
        return self.success(submission_data)

    @validate_serializer(ShareSubmissionSerializer)
    @login_required
    def put(self, request):
        """
        share submission
        """
        try:
            submission = Submission.objects.select_related("problem").get(id=request.data["id"])
        except Submission.DoesNotExist:
            return self.error("Submission doesn't exist")
        if not submission.check_user_permission(request.user, check_share=False):
            return self.error("No permission to share the submission")
        if submission.contest and submission.contest.status == ContestStatus.CONTEST_UNDERWAY:
            return self.error("Can not share submission now")
        submission.shared = request.data["shared"]
        submission.save(update_fields=["shared"])
        return self.success()


class SubmissionListAPI(APIView):
    def get(self, request):
        if not request.GET.get("limit"):
            return self.error("Limit is needed")
        if request.GET.get("contest_id"):
            return self.error("Parameter error")

        submissions = Submission.objects.filter(contest_id__isnull=True).select_related("problem__created_by")
        problem_id = request.GET.get("problem_id")
        myself = request.GET.get("myself")
        result = request.GET.get("result")
        username = request.GET.get("username")
        if problem_id:
            try:
                problem = Problem.objects.get(_id=problem_id, contest_id__isnull=True, visible=True)
            except Problem.DoesNotExist:
                return self.error("Problem doesn't exist")
            submissions = submissions.filter(problem=problem)
        if (myself and myself == "1") or not SysOptions.submission_list_show_all:
            submissions = submissions.filter(user_id=request.user.id)
        elif username:
            submissions = submissions.filter(username__icontains=username)
        if result:
            submissions = submissions.filter(result=result)
        data = self.paginate_data(request, submissions)
        data["results"] = SubmissionListSerializer(data["results"], many=True, user=request.user).data
        
        # ============================================================================
        # 【改进建议5】：在提交列表中添加统计信息用于智能分析
        # ============================================================================
        # 建议添加用户统计数据：
        # if request.user.is_authenticated:
        #     user_stats = self._get_user_statistics(request.user.id)
        #     data["user_stats"] = {
        #         "total_submissions": user_stats["total"],
        #         "accepted_count": user_stats["accepted"],
        #         "acceptance_rate": user_stats["acceptance_rate"],
        #         "favorite_languages": user_stats["top_languages"],
        #         "weak_topics": user_stats["weak_topics"],  # 用于推荐
        #         "skill_level": user_stats["estimated_rating"]  # 综合能力评分
        #     }
        
        return self.success(data)


class ContestSubmissionListAPI(APIView):
    @check_contest_permission(check_type="submissions")
    def get(self, request):
        if not request.GET.get("limit"):
            return self.error("Limit is needed")

        contest = self.contest
        submissions = Submission.objects.filter(contest_id=contest.id).select_related("problem__created_by")
        problem_id = request.GET.get("problem_id")
        myself = request.GET.get("myself")
        result = request.GET.get("result")
        username = request.GET.get("username")
        if problem_id:
            try:
                problem = Problem.objects.get(_id=problem_id, contest_id=contest.id, visible=True)
            except Problem.DoesNotExist:
                return self.error("Problem doesn't exist")
            submissions = submissions.filter(problem=problem)

        if myself and myself == "1":
            submissions = submissions.filter(user_id=request.user.id)
        elif username:
            submissions = submissions.filter(username__icontains=username)
        if result:
            submissions = submissions.filter(result=result)

        # filter the test submissions submitted before contest start
        if contest.status != ContestStatus.CONTEST_NOT_START:
            submissions = submissions.filter(create_time__gte=contest.start_time)

        # 封榜的时候只能看到自己的提交
        if contest.rule_type == ContestRuleType.ACM:
            if not contest.real_time_rank and not request.user.is_contest_admin(contest):
                submissions = submissions.filter(user_id=request.user.id)

        data = self.paginate_data(request, submissions)
        data["results"] = SubmissionListSerializer(data["results"], many=True, user=request.user).data
        return self.success(data)


class SubmissionExistsAPI(APIView):
    def get(self, request):
        if not request.GET.get("problem_id"):
            return self.error("Parameter error, problem_id is required")
        return self.success(request.user.is_authenticated and
                            Submission.objects.filter(problem_id=request.GET["problem_id"],
                                                      user_id=request.user.id).exists())


# ============================================================================
# 【改进建议6】：新增智能推荐API类
# ============================================================================
# 建议添加以下新的API类：
#
# class ProblemRecommendationAPI(APIView):
#     """智能题目推荐API - 基于用户历史提交和能力画像"""
#     
#     @login_required
#     def get(self, request):
#         user_id = request.user.id
#         strategy = request.GET.get('strategy', 'adaptive')  # adaptive/weak_point/progressive
#         count = int(request.GET.get('count', 10))
#         
#         # 获取用户能力画像
#         user_profile = self._analyze_user_profile(user_id)
#         
#         # 根据不同策略推荐
#         if strategy == 'adaptive':
#             # 自适应难度推荐
#             recommendations = self._adaptive_recommendation(user_profile, count)
#         elif strategy == 'weak_point':
#             # 查漏补缺推荐
#             recommendations = self._weak_point_recommendation(user_profile, count)
#         elif strategy == 'progressive':
#             # 进阶路径推荐
#             recommendations = self._progressive_recommendation(user_profile, count)
#         else:
#             recommendations = []
#         
#         return self.success({
#             'recommendations': recommendations,
#             'user_profile': user_profile,
#             'strategy': strategy
#         })
#     
#     def _analyze_user_profile(self, user_id):
#         """分析用户能力画像"""
#         # 获取最近3个月的提交
#         recent_submissions = Submission.objects.filter(
#             user_id=user_id,
#             create_time__gte=datetime.now() - timedelta(days=90)
#         ).select_related('problem')
#         
#         # 统计各种指标
#         total = recent_submissions.count()
#         accepted = recent_submissions.filter(result=0).count()  # 假设0表示AC
#         
#         # 分析算法标签掌握情况
#         solved_problems = Problem.objects.filter(
#             submission__user_id=user_id,
#             submission__result=0
#         ).distinct()
#         
#         # 提取技能标签统计
#         skill_stats = defaultdict(lambda: {'solved': 0, 'total_attempts': 0})
#         for problem in solved_problems:
#             if hasattr(problem, 'tags'):
#                 for tag in problem.tags:
#                     skill_stats[tag]['solved'] += 1
#         
#         return {
#             'user_id': user_id,
#             'total_submissions': total,
#             'accepted_count': accepted,
#             'acceptance_rate': accepted / total if total > 0 else 0,
#             'skill_stats': dict(skill_stats),
#             'estimated_rating': self._calculate_rating(recent_submissions),
#             'active_days': recent_submissions.dates('create_time', 'day').count()
#         }
#     
#     def _adaptive_recommendation(self, profile, count):
#         """自适应难度推荐 - 推荐略高于当前水平的题目"""
#         target_difficulty = self._calculate_target_difficulty(profile['estimated_rating'])
#         
#         # 获取用户未做过的题目
#         solved_problem_ids = Submission.objects.filter(
#             user_id=profile['user_id'],
#             result=0
#         ).values_list('problem_id', flat=True)
#         
#         # 推荐相关技能的题目
#         recommendations = Problem.objects.filter(
#             difficulty=target_difficulty,
#             visible=True
#         ).exclude(
#             id__in=solved_problem_ids
#         ).order_by('?')[:count]
#         
#         return [self._format_recommendation(p, 'adaptive') for p in recommendations]
#     
#     def _weak_point_recommendation(self, profile, count):
#         """查漏补缺推荐 - 针对薄弱知识点"""
#         # 识别薄弱知识点（尝试次数多但AC率低的标签）
#         weak_tags = self._identify_weak_tags(profile['user_id'])
#         
#         if not weak_tags:
#             # 如果没有明显薄弱点，返回自适应推荐
#             return self._adaptive_recommendation(profile, count)
#         
#         # 推荐薄弱标签的简单题目
#         recommendations = Problem.objects.filter(
#             tags__overlap=weak_tags,
#             difficulty='Easy',
#             visible=True
#         ).order_by('?')[:count]
#         
#         return [self._format_recommendation(p, 'weak_point') for p in recommendations]
#     
#     def _progressive_recommendation(self, profile, count):
#         """进阶路径推荐 - 构建学习路径"""
#         # 基于用户当前水平，推荐循序渐进的题目序列
#         # 可以实现一个知识图谱，按依赖关系推荐
#         return self._adaptive_recommendation(profile, count)
#     
#     def _calculate_rating(self, submissions):
#         """计算用户综合能力评分（简化版ELO）"""
#         # 可以根据AC的题目难度、提交次数等计算
#         return 1200  # 默认评分
#     
#     def _calculate_target_difficulty(self, rating):
#         """根据评分计算目标难度"""
#         if rating < 1300:
#             return 'Easy'
#         elif rating < 1600:
#             return 'Medium'
#         else:
#             return 'Hard'
#     
#     def _identify_weak_tags(self, user_id):
#         """识别用户薄弱的算法标签"""
#         # 统计每个标签的AC率
#         # 返回AC率较低的标签
#         return []
#     
#     def _format_recommendation(self, problem, reason):
#         """格式化推荐结果"""
#         return {
#             'problem_id': problem.id,
#             'title': problem.title,
#             'difficulty': problem.difficulty,
#             'tags': problem.tags if hasattr(problem, 'tags') else [],
#             'acceptance_rate': problem.acceptance_rate if hasattr(problem, 'acceptance_rate') else 0,
#             'recommendation_reason': reason
#         }
#
#
# class UserProfileAPI(APIView):
#     """用户能力画像API"""
#     
#     @login_required
#     def get(self, request):
#         user_id = request.user.id
#         
#         # 获取详细的用户画像
#         profile = self._get_detailed_profile(user_id)
#         
#         return self.success(profile)
#     
#     def _get_detailed_profile(self, user_id):
#         """获取详细用户画像"""
#         submissions = Submission.objects.filter(user_id=user_id)
#         
#         return {
#             'basic_stats': self._get_basic_stats(submissions),
#             'skill_radar': self._get_skill_radar(user_id),  # 技能雷达图数据
#             'progress_trend': self._get_progress_trend(submissions),  # 进步趋势
#             'language_distribution': self._get_language_stats(submissions),
#             'recent_activity': self._get_recent_activity(user_id)
#         }
#     
#     def _get_basic_stats(self, submissions):
#         """基础统计"""
#         return {}
#     
#     def _get_skill_radar(self, user_id):
#         """技能雷达图"""
#         return {}
#     
#     def _get_progress_trend(self, submissions):
#         """进步趋势"""
#         return {}
#     
#     def _get_language_stats(self, submissions):
#         """语言分布统计"""
#         return {}
#     
#     def _get_recent_activity(self, user_id):
#         """最近活动"""
#         return {}


class AIModifyCodeAPI(APIView):
    @validate_serializer(AIModifyCodeSerializer)
    @login_required
    def post(self, request):
        """
        Use GPT-3.5-turbo API to modify code
        """
        # ============================================================================
        # 【安全问题 - 必须立即修复！】
        # 硬编码的API Key已暴露，必须改用环境变量或配置系统
        # ============================================================================
        # 正确做法：
        # openai_api_key = os.getenv('OPENAI_API_KEY') or SysOptions.openai_api_key
        # if not openai_api_key:
        #     return self.error("AI service is not configured. Please contact administrator.")
        
        # Get API key from request or use default
        openai_api_key = request.data.get("openai_api_key", "").strip()
        if not openai_api_key:
            # 【安全风险】不要在代码中硬编码API Key！
            # Use default API key if not provided
            openai_api_key = 'sk-5mGnAe0NvCGnwwcBiOcAwLHXl4h1NSFm3xD5yL0mdWS5FkaE'
        
        # ============================================================================
        # 【改进建议7】：添加API调用频率限制和成本控制
        # ============================================================================
        # 建议添加：
        # - 每个用户每日AI调用次数限制
        # - API调用成本统计和预算控制
        # - 缓存相似代码的分析结果
        # 示例：
        # daily_limit = 10
        # cache_key = f"ai_code_modify_{user_id}_{hash(code)}"
        # cached_result = cache.get(cache_key)
        # if cached_result:
        #     return self.success(cached_result)
        # 
        # usage_count = cache.get(f"ai_usage_{user_id}_{today}") or 0
        # if usage_count >= daily_limit:
        #     return self.error("Daily AI usage limit reached")
        
        # Initialize OpenAI client with custom API key and base URL
        client = OpenAI(api_key=openai_api_key, base_url='https://poloai.top/v1')
        
        code = request.data.get("code")
        language = request.data.get("language")
        problem_description = request.data.get("problem_description", "")
        
        # ============================================================================
        # 【改进建议8】：增强AI提示词，包含更多上下文信息
        # ============================================================================
        # 建议添加：
        # - 用户历史提交的错误模式
        # - 该题目其他用户的常见错误
        # - 测试用例提示
        # 示例扩展：
        # user_common_mistakes = self._get_user_common_mistakes(request.user.id)
        # problem_hints = self._get_problem_hints(problem_id)
        # prompt += f"\n\nUser's common mistakes: {user_common_mistakes}"
        # prompt += f"\n\nProblem hints: {problem_hints}"
        
        # Prepare the original code lines for diff format
        original_lines = code.split('\n')
        
        # Prepare the prompt for GPT-3.5-turbo with problem context and diff format requirement
        prompt = f"""You are an expert code reviewer and optimizer. Please review and improve the following {language} code based on the problem requirements.

## Problem Context:
{problem_description}

## Current Code:
```{language.lower()}
{code}
```

## Requirements:
1. Fix any bugs or logical errors based on the problem context
2. Improve code quality, readability, and efficiency
3. Follow best practices for {language}
4. Maintain the same functionality and ensure it solves the problem correctly

## Output Format:
You MUST output the code modifications in diff format, line by line. Each line should be prefixed as follows:
- Lines to DELETE: prefix with "- " (minus sign followed by space, e.g., "- int old_var = 0;")
- Lines to ADD: prefix with "+ " (plus sign followed by space, e.g., "+ int new_var = 1;")
- Lines to KEEP unchanged: no prefix, output the original line as-is (e.g., "  return 0;")

IMPORTANT:
- Output the ENTIRE code in diff format, including unchanged lines
- Start from the first line of code
- Do NOT include any explanations, comments, or markdown formatting
- Do NOT include code block markers (```)
- Preserve the exact structure and indentation of the original code
- Only modify lines that need improvement, keep other lines unchanged

Example format:
- int a = 1;
+ int a = 1, b = 2;
  int main() {{
    return 0;
  }}"""
        
        try:
            # ============================================================================
            # 【改进建议9】：记录AI调用日志用于分析和优化
            # ============================================================================
            # 建议添加：
            # ai_call_log = AICallLog.objects.create(
            #     user_id=request.user.id,
            #     api_type='code_modify',
            #     input_tokens=len(prompt.split()),
            #     timestamp=datetime.now()
            # )
            
            # Call OpenAI GPT-3.5-turbo API
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful code review assistant. You MUST return code modifications in diff format: lines prefixed with '- ' are deleted, lines prefixed with '+ ' are added, and lines without prefix are kept unchanged. Output the ENTIRE code in this format, including all unchanged lines. Do not include any explanations, comments, or markdown formatting."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,
                max_tokens=4000,
                timeout=30
            )
            
            diff_output = response.choices[0].message.content.strip()
            
            # ============================================================================
            # 【改进建议10】：提取并存储AI分析结果用于后续推荐
            # ============================================================================
            # 建议添加：
            # - 提取代码改进类型（性能优化、bug修复、代码风格等）
            # - 分析用户常犯错误模式
            # - 更新用户能力画像
            # 示例：
            # improvement_type = self._analyze_improvement_type(original_code, modified_code)
            # UserMistakePattern.objects.create(
            #     user_id=request.user.id,
            #     mistake_type=improvement_type,
            #     language=language,
            #     frequency=1
            # )
            
            # Remove markdown code blocks if present
            if diff_output.startswith("```"):
                lines = diff_output.split("\n")
                diff_output = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])
            
            # Parse diff format and apply changes to generate final code
            modified_code = self._apply_diff(original_lines, diff_output)
            
            # ============================================================================
            # 【改进建议11】：返回更详细的分析结果
            # ============================================================================
            # 建议扩展返回内容：
            # return self.success({
            #     "modified_code": modified_code,
            #     "improvements": [
            #         {"type": "bug_fix", "description": "修复了数组越界问题"},
            #         {"type": "optimization", "description": "优化了时间复杂度从O(n²)到O(n)"}
            #     ],
            #     "learning_points": [
            #         "注意边界条件检查",
            #         "使用哈希表可以优化查找效率"
            #     ],
            #     "complexity_analysis": {
            #         "time": "O(n)",
            #         "space": "O(n)"
            #     }
            # })
            
            return self.success({"modified_code": modified_code})
            
        except Exception as e:
            error_msg = str(e)
            if hasattr(e, 'response') and hasattr(e.response, 'json'):
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get("error", {}).get("message", error_msg)
                except:
                    pass
            
            # ============================================================================
            # 【改进建议12】：记录错误日志用于监控和优化
            # ============================================================================
            # 建议添加：
            # import logging
            # logger = logging.getLogger(__name__)
            # logger.error(f"AI API error for user {request.user.id}: {error_msg}")
            
            return self.error(f"AI API error: {error_msg}")
    
    def _apply_diff(self, original_lines, diff_output):
        """
        Apply diff format changes to original code.
        Diff format: lines prefixed with '- ' are deleted, '+ ' are added, no prefix are kept.
        """
        
        result_lines = []
        diff_lines = [line.rstrip('\r') for line in diff_output.split('\n')]
        original_index = 0
        
        i = 0
        while i < len(diff_lines):
            line = diff_lines[i]
            
            # Check if line starts with diff prefix (with space)
            if line.startswith('- '):
                # Line to delete - skip corresponding original line
                if original_index < len(original_lines):
                    original_index += 1
            elif line.startswith('+ '):
                # Line to add - add it to result
                result_lines.append(line[2:])  # Remove '+ ' prefix
            elif line.startswith('-'):
                # Line to delete (without space after -) - handle as delete
                if original_index < len(original_lines):
                    original_index += 1
            elif line.startswith('+'):
                # Line to add (without space after +) - handle as add
                result_lines.append(line[1:].lstrip())
            elif line.strip() == '':
                # Empty line - check if original has empty line at this position
                if original_index < len(original_lines):
                    if original_lines[original_index].strip() == '':
                        result_lines.append('')
                        original_index += 1
                    else:
                        # Original doesn't have empty line here, but diff does - add it
                        result_lines.append('')
                else:
                    # Past end of original, add empty line
                    result_lines.append('')
            else:
                # Line to keep unchanged - use original line to preserve exact formatting
                if original_index < len(original_lines):
                    result_lines.append(original_lines[original_index])
                    original_index += 1
                else:
                    # No more original lines, but diff has more - add as-is (remove any accidental prefix)
                    clean_line = line.lstrip(' +-')
                    result_lines.append(clean_line)
            
            i += 1
        
        # Add any remaining original lines that weren't processed (shouldn't happen in proper diff)
        while original_index < len(original_lines):
            result_lines.append(original_lines[original_index])
            original_index += 1
        
        return '\n'.join(result_lines)


# ============================================================================
# 【改进建议13】：添加后台任务处理代码特征提取
# ============================================================================
# 建议在 tasks.py 中添加：
#
# from celery import shared_task
# import json
#
# @shared_task
# def extract_code_features(submission_id):
#     """异步提取代码特征"""
#     try:
#         submission = Submission.objects.get(id=submission_id)
#         
#         # 使用AI分析代码特征
#         client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
#         
#         prompt = f"""Analyze this {submission.language} code and extract features in JSON format:
#         {{
#             "algorithms": ["BFS", "Dynamic Programming"],
#             "data_structures": ["Array", "HashMap"],
#             "time_complexity": "O(n log n)",
#             "space_complexity": "O(n)",
#             "code_quality_score": 8.5,
#             "common_patterns": ["Sliding Window", "Two Pointers"],
#             "potential_issues": []
#         }}
#         
#         Code:
#         ```{submission.language}
#         {submission.code}
#         ```
#         """
#         
#         response = client.chat.completions.create(
#             model="gpt-3.5-turbo",
#             messages=[
#                 {"role": "system", "content": "You are a code analysis expert. Return only valid JSON."},
#                 {"role": "user", "content": prompt}
#             ],
#             temperature=0.2
#         )
#         
#         features = json.loads(response.choices[0].message.content)
#         
#         # 保存特征到数据库
#         submission.code_features = features
#         submission.save(update_fields=['code_features'])
#         
#         # 触发用户画像更新
#         update_user_profile.delay(submission.user_id)
#         
#     except Exception as e:
#         print(f"Error extracting code features: {e}")
#
#
# @shared_task
# def update_user_profile(user_id):
#     """更新用户能力画像"""
#     try:
#         # 获取用户最近的提交
#         recent_submissions = Submission.objects.filter(
#             user_id=user_id,
#             code_features__isnull=False
#         ).order_by('-create_time')[:100]
#         
#         # 统计算法和数据结构使用频率
#         algorithm_freq = defaultdict(int)
#         data_structure_freq = defaultdict(int)
#         
#         for sub in recent_submissions:
#             features = sub.code_features
#             for algo in features.get('algorithms', []):
#                 algorithm_freq[algo] += 1
#             for ds in features.get('data_structures', []):
#                 data_structure_freq[ds] += 1
#         
#         # 更新用户画像表
#         # UserProfile.objects.update_or_create(
#         #     user_id=user_id,
#         #     defaults={
#         #         'algorithm_skills': dict(algorithm_freq),
#         #         'data_structure_skills': dict(data_structure_freq),
#         #         'last_updated': datetime.now()
#         #     }
#         # )
#         
#     except Exception as e:
#         print(f"Error updating user profile: {e}")


# ============================================================================
# 【改进建议14】：数据库模型扩展建议
# ============================================================================
# 建议在 models.py 中添加新模型：
#
# from django.db import models
# from django.contrib.postgres.fields import JSONField
#
# class UserProfile(models.Model):
#     """用户能力画像"""
#     user = models.OneToOneField(User, on_delete=models.CASCADE)
#     estimated_rating = models.IntegerField(default=1200)  # ELO评分
#     algorithm_skills = JSONField(default=dict)  # {"DP": 85, "Graph": 70, ...}
#     data_structure_skills = JSONField(default=dict)  # {"Array": 90, "Tree": 75, ...}
#     weak_points = JSONField(default=list)  # ["Greedy", "Backtracking"]
#     strong_points = JSONField(default=list)  # ["Sorting", "Binary Search"]
#     total_problems_solved = models.IntegerField(default=0)
#     acceptance_rate = models.FloatField(default=0.0)
#     preferred_languages = JSONField(default=list)  # ["Python", "C++"]
#     last_updated = models.DateTimeField(auto_now=True)
#     
#     class Meta:
#         db_table = 'user_profile'
#
#
# class UserMistakePattern(models.Model):
#     """用户常犯错误模式"""
#     user = models.ForeignKey(User, on_delete=models.CASCADE)
#     mistake_type = models.CharField(max_length=100)  # "off_by_one", "null_pointer", etc.
#     language = models.CharField(max_length=20)
#     frequency = models.IntegerField(default=1)
#     last_occurrence = models.DateTimeField(auto_now=True)
#     examples = JSONField(default=list)  # 错误示例
#     
#     class Meta:
#         db_table = 'user_mistake_pattern'
#         unique_together = ('user', 'mistake_type', 'language')
#
#
# class AICallLog(models.Model):
#     """AI API调用日志"""
#     user = models.ForeignKey(User, on_delete=models.CASCADE)
#     api_type = models.CharField(max_length=50)  # "code_modify", "feature_extract", etc.
#     input_tokens = models.IntegerField()
#     output_tokens = models.IntegerField(null=True)
#     cost = models.DecimalField(max_digits=10, decimal_places=6, null=True)
#     success = models.BooleanField(default=True)
#     error_message = models.TextField(null=True)
#     timestamp = models.DateTimeField(auto_now_add=True)
#     
#     class Meta:
#         db_table = 'ai_call_log'
#         indexes = [
#             models.Index(fields=['user', 'timestamp']),
#         ]
#
#
# # 扩展原有的Submission模型
# # 在 Submission 模型中添加字段：
# class Submission(models.Model):
#     # ... 原有字段 ...
#     
#     # 新增字段用于智能推荐
#     code_features = JSONField(null=True, blank=True)  # AI提取的代码特征
#     solve_time = models.IntegerField(null=True)  # 解题用时（秒）
#     attempt_count = models.IntegerField(default=1)  # 该题目尝试次数
#     code_length = models.IntegerField(null=True)  # 代码行数
#     submission_start_time = models.DateTimeField(null=True)  # 开始做题时间
#     
#     def save(self, *args, **kwargs):
#         # 自动计算代码长度
#         if self.code:
#             self.code_length = len(self.code.split('\n'))
#         
#         # 自动计算解题用时
#         if self.submission_start_time and self.create_time:
#             self.solve_time = int((self.create_time - self.submission_start_time).total_seconds())
#         
#         super().save(*args, **kwargs)


# ============================================================================
# 【改进建议15】：URL路由配置
# ============================================================================
# 建议在 urls.py 中添加：
#
# from django.urls import path
# from .views import (
#     ProblemRecommendationAPI,
#     UserProfileAPI,
#     # ... 其他导入
# )
#
# urlpatterns = [
#     # 现有路由...
#     
#     # 新增智能推荐相关路由
#     path('api/recommendation/', ProblemRecommendationAPI.as_view(), name='problem_recommendation'),
#     path('api/user/profile/', UserProfileAPI.as_view(), name='user_profile'),
#     path('api/user/skill-analysis/', SkillAnalysisAPI.as_view(), name='skill_analysis'),
#     path('api/learning-path/', LearningPathAPI.as_view(), name='learning_path'),
# ]


# ============================================================================
# 【总体架构建议】
# ============================================================================
# 
# 实现智能推荐系统的完整架构：
#
# 1. 数据收集层
#    - 扩展Submission模型，记录更多元数据
#    - 记录用户做题时间、尝试次数、代码变化
#
# 2. 特征提取层
#    - 使用AI异步提取代码特征（算法、数据结构、复杂度）
#    - 构建用户能力画像（UserProfile模型）
#    - 识别用户常犯错误模式（UserMistakePattern模型）
#
# 3. 推荐算法层
#    - 自适应难度推荐：根据用户水平推荐合适难度
#    - 查漏补缺推荐：针对薄弱知识点
#    - 协同过滤：推荐相似用户喜欢的题目
#    - 进阶路径：构建知识图谱，循序渐进
#
# 4. API接口层
#    - ProblemRecommendationAPI：题目推荐
#    - UserProfileAPI：用户画像查询
#    - SkillAnalysisAPI：技能分析
#    - LearningPathAPI：学习路径规划
#
# 5. 前端展示层
#    - 推荐题目列表（带推荐理由）
#    - 用户能力雷达图
#    - 学习进度可视化
#    - 薄弱知识点提醒
#
# 6. 优化和监控
#    - AI调用成本控制
#    - 推荐效果评估（点击率、完成率）
#    - A/B测试不同推荐策略
#    - 缓存常用推荐结果
#
# ============================================================================
