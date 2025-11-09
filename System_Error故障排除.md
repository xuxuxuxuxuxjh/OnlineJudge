# System Error 故障排除指南

## 什么是 System Error？

System Error（系统错误）是 OnlineJudge 判题过程中出现的错误状态，表示判题服务器无法正常响应或处理提交的代码。

## System Error 出现的原因

根据代码分析，System Error 在以下情况下会出现：

1. **判题服务器无响应**：判题服务器无法连接或超时
2. **判题服务器返回无效响应**：返回的不是有效的 JSON 格式
3. **网络连接问题**：后端无法连接到判题服务器
4. **判题服务器未启动**：判题服务容器未运行
5. **TOKEN 不匹配**：判题服务器 TOKEN 配置错误

## 诊断步骤

### 1. 检查判题服务器状态

#### 方法一：通过管理后台检查

1. 登录管理后台：`http://YOUR_SERVER_IP/admin`
2. 进入 **"Judge Server"**（判题服务器）页面
3. 查看判题服务器状态：
   - **Normal**（正常）：绿色标签，表示服务器正常
   - **Abnormal**（异常）：红色标签，表示服务器异常

#### 方法二：通过 Docker 检查

```bash
# 检查判题服务器容器是否运行
docker ps | grep oj-judge

# 查看判题服务器日志
docker logs oj-judge --tail 50

# 检查判题服务器容器状态
docker inspect oj-judge | grep -A 10 "Status"
```

### 2. 检查判题服务器配置

#### 检查 docker-compose.yml 配置

确保 `docker-compose.yml` 中的 TOKEN 配置一致：

```yaml
oj-judge:
  environment:
    - TOKEN=34a6fb0dd6bc56fc438267f31cbee8b45ba3df8ddccae02b5dd6ebee0fa423f6

oj-backend:
  environment:
    - JUDGE_SERVER_TOKEN=34a6fb0dd6bc56fc438267f31cbee8b45ba3df8ddccae02b5dd6ebee0fa423f6
```

**重要**：两处的 TOKEN 必须**完全相同**！

#### 检查判题服务器 URL

```yaml
oj-judge:
  environment:
    - SERVICE_URL=http://oj-judge:12358
    - BACKEND_URL=http://oj-backend:8000/api/judge_server_heartbeat/
```

### 3. 检查后端日志

```bash
# 查看后端日志
docker logs oj-backend --tail 100 | grep -i "judge\|error\|exception"

# 实时查看日志
docker logs -f oj-backend
```

查找以下错误信息：
- `Judge server request timeout`
- `Judge server connection error`
- `Judge server request error`
- `Judge server response is not valid JSON`

### 4. 检查网络连接

```bash
# 从后端容器测试连接到判题服务器
docker exec oj-backend ping -c 3 oj-judge

# 测试判题服务器端口
docker exec oj-backend curl -v http://oj-judge:12358/health
```

## 常见问题及解决方案

### 问题 1：判题服务器显示 Abnormal 状态

**原因**：
- 判题服务器心跳超时（超过6秒未收到心跳）
- 判题服务器容器未运行
- 网络连接问题

**解决方案**：

1. **重启判题服务器**：
   ```bash
   docker-compose restart oj-judge
   ```

2. **检查判题服务器日志**：
   ```bash
   docker logs oj-judge --tail 100
   ```

3. **检查网络连接**：
   ```bash
   docker network inspect onlinejudge_default | grep -A 5 oj-judge
   ```

### 问题 2：TOKEN 不匹配

**原因**：
- `docker-compose.yml` 中两处的 TOKEN 不一致
- 环境变量未正确加载

**解决方案**：

1. **检查 TOKEN 配置**：
   ```bash
   # 检查 docker-compose.yml 中的 TOKEN
   grep -A 2 "TOKEN\|JUDGE_SERVER_TOKEN" docker-compose.yml
   ```

2. **确保 TOKEN 一致**：
   - `oj-judge` 的 `TOKEN` 和 `oj-backend` 的 `JUDGE_SERVER_TOKEN` 必须相同

3. **重启服务**：
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### 问题 3：判题服务器无法连接

**原因**：
- 判题服务器容器未启动
- 端口被占用
- Docker 网络配置问题

**解决方案**：

1. **检查容器状态**：
   ```bash
   docker ps -a | grep oj-judge
   ```

2. **启动判题服务器**：
   ```bash
   docker-compose up -d oj-judge
   ```

3. **检查端口占用**：
   ```bash
   netstat -tulpn | grep 12358
   ```

4. **检查 Docker 网络**：
   ```bash
   docker network ls
   docker network inspect onlinejudge_default
   ```

### 问题 4：判题服务器返回无效 JSON

**原因**：
- 判题服务器内部错误
- 响应格式不正确

**解决方案**：

1. **查看判题服务器日志**：
   ```bash
   docker logs oj-judge --tail 100
   ```

2. **重启判题服务器**：
   ```bash
   docker-compose restart oj-judge
   ```

3. **检查判题服务器版本**：
   - 确保使用兼容的判题服务器版本

### 问题 5：多个判题服务器记录导致 Abnormal 状态

**原因**：
- 数据库中存在多个判题服务器记录
- 旧的判题服务器容器已停止但记录未删除
- 导致管理后台显示旧的 Abnormal 状态

**症状**：
- 管理后台显示多个判题服务器
- 其中一个显示 Abnormal 状态，CPU 100%
- 但实际运行的判题服务器是正常的

**解决方案**：

1. **检查数据库中的判题服务器记录**：
   ```bash
   docker exec oj-backend python manage.py shell -c "from conf.models import JudgeServer; servers = JudgeServer.objects.all(); [print(f'Hostname: {s.hostname}, Status: {s.status}, Last Heartbeat: {s.last_heartbeat}') for s in servers]"
   ```

2. **删除旧的判题服务器记录**：
   ```bash
   # 删除特定hostname的旧记录
   docker exec oj-backend python manage.py shell -c "from conf.models import JudgeServer; JudgeServer.objects.filter(hostname='OLD_HOSTNAME').delete()"
   
   # 或者删除所有Abnormal状态的记录
   docker exec oj-backend python manage.py shell -c "from conf.models import JudgeServer; from django.utils import timezone; from datetime import timedelta; old_time = timezone.now() - timedelta(minutes=10); JudgeServer.objects.filter(last_heartbeat__lt=old_time).delete()"
   ```

3. **通过管理后台删除**：
   - 登录管理后台
   - 进入 "Judge Server" 页面
   - 找到 Abnormal 状态的服务器
   - 点击删除按钮

### 问题 6：所有提交都显示 System Error

**原因**：
- 判题服务器完全无法访问
- 配置严重错误

**解决方案**：

1. **完全重启所有服务**：
   ```bash
   docker-compose down
   docker-compose up -d
   ```

2. **检查所有服务状态**：
   ```bash
   docker-compose ps
   ```

3. **验证配置**：
   ```bash
   docker-compose config
   ```

## 预防措施

1. **定期检查判题服务器状态**：
   - 每天检查管理后台的判题服务器状态
   - 设置监控告警（如果可能）

2. **保持配置一致**：
   - 确保 TOKEN 配置一致
   - 使用版本控制管理配置文件

3. **监控日志**：
   - 定期查看后端和判题服务器日志
   - 设置日志轮转避免日志文件过大

4. **测试判题功能**：
   - 定期提交测试代码验证判题功能正常

## 检查清单

当遇到 System Error 时，按以下顺序检查：

- [ ] 判题服务器容器是否运行？
- [ ] 判题服务器状态是否为 Normal？
- [ ] 数据库中是否有多个判题服务器记录？（如果有，删除旧的）
- [ ] TOKEN 配置是否一致？
- [ ] 网络连接是否正常？
- [ ] 后端日志是否有错误信息？
- [ ] 判题服务器日志是否有错误？
- [ ] 所有服务是否都已启动？

## 快速修复命令

### 删除所有异常的判题服务器记录

```bash
# 删除超过10分钟未心跳的判题服务器记录
docker exec oj-backend python manage.py shell -c "
from conf.models import JudgeServer
from django.utils import timezone
from datetime import timedelta
old_time = timezone.now() - timedelta(minutes=10)
deleted = JudgeServer.objects.filter(last_heartbeat__lt=old_time).delete()
print(f'Deleted {deleted[0]} old judge server records')
"
```

### 查看当前所有判题服务器状态

```bash
docker exec oj-backend python manage.py shell -c "
from conf.models import JudgeServer
servers = JudgeServer.objects.all()
print(f'Total servers: {servers.count()}')
for s in servers:
    print(f'  Hostname: {s.hostname}')
    print(f'    Status: {s.status}')
    print(f'    Service URL: {s.service_url}')
    print(f'    Last Heartbeat: {s.last_heartbeat}')
    print(f'    Task Number: {s.task_number}')
    print()
"
```

## 获取帮助

如果以上方法都无法解决问题，请提供以下信息：

1. **系统信息**：
   ```bash
   docker-compose ps
   docker-compose logs oj-backend --tail 50
   docker-compose logs oj-judge --tail 50
   ```

2. **配置信息**：
   - `docker-compose.yml` 中的相关配置（隐藏敏感信息）

3. **错误信息**：
   - 具体的错误日志
   - System Error 出现的频率和模式

## 相关文件

- 判题调度器：`judge/dispatcher.py`
- 判题服务器模型：`conf/models.py`
- Docker 配置：`docker-compose.yml`

---

**最后更新**：2024年

