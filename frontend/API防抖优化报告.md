# API请求防抖优化

## 优化概述

本次优化主要解决了OnlineJudge系统中API请求缺少防抖(debounce)机制的问题，特别是在搜索功能中。通过添加防抖机制，有效减少了频繁的API请求，提升了用户体验和系统性能。

## 优化内容

### 1. 核心工具函数扩展

**文件：** `/frontend/src/utils/utils.js`

新增了以下防抖相关工具函数：

```javascript
// 防抖函数：在事件被触发n秒后再执行回调，如果在这n秒内又被触发，则重新计时
function debounce (func, wait, immediate)

// 节流函数：规定在一个单位时间内，只能触发一次函数
function throttle (func, limit)

// 创建一个防抖化的搜索函数
function createDebouncedSearch (searchFunction, delay = 300)
```

### 2. 优化的搜索功能

#### 2.1 用户端(OJ)搜索功能

1. **题目列表搜索** (`/frontend/src/pages/oj/views/problem/ProblemList.vue`)
   - 添加了 `@on-change="debouncedKeywordSearch"` 事件监听
   - 防抖延迟：300ms

2. **比赛列表搜索** (`/frontend/src/pages/oj/views/contest/ContestList.vue`)
   - 添加了 `@on-change="debouncedKeywordSearch"` 事件监听
   - 防抖延迟：300ms

3. **提交记录搜索** (`/frontend/src/pages/oj/views/submission/SubmissionList.vue`)
   - 优化了用户名搜索功能
   - 添加了 `@on-change="debouncedUsernameSearch"` 事件监听
   - 防抖延迟：300ms

#### 2.2 管理员端搜索功能

1. **用户管理搜索** (`/frontend/src/pages/admin/views/general/User.vue`)
   - 优化了关键字搜索的watch监听
   - 防抖延迟：500ms（考虑到用户列表可能较大）

2. **题目管理搜索** (`/frontend/src/pages/admin/views/problem/ProblemList.vue`)
   - 优化了关键字搜索的watch监听
   - 防抖延迟：500ms

3. **比赛管理搜索** (`/frontend/src/pages/admin/views/contest/ContestList.vue`)
   - 优化了关键字搜索的watch监听
   - 防抖延迟：500ms

4. **添加公共题目搜索** (`/frontend/src/pages/admin/views/problem/AddPublicProblem.vue`)
   - 优化了关键字搜索的watch监听
   - 防抖延迟：500ms

5. **导入导出题目搜索** (`/frontend/src/pages/admin/views/problem/ImportAndExport.vue`)
   - 优化了关键字搜索的watch监听
   - 防抖延迟：500ms

## 技术细节

### 防抖机制原理

防抖机制通过以下方式工作：
1. 用户输入时，开始计时
2. 如果在指定时间内（如300ms）再次输入，重新开始计时
3. 只有当用户停止输入且超过指定时间后，才执行实际的搜索请求

### 延迟时间选择

- **用户端搜索**：300ms - 平衡响应速度和请求频率
- **管理员端搜索**：500ms - 管理员操作相对不那么频繁，可以适当增加延迟以减少服务器压力

### 兼容性保障

- 保持原有的 `@on-enter` 和 `@on-click` 事件，确保用户可以主动触发搜索
- 新增的防抖机制作为补充，在用户输入过程中自动触发

## 性能提升

### 预期效果

1. **减少API请求次数**：用户快速输入时，API请求次数可减少60-80%
2. **降低服务器负载**：减少数据库查询次数，提升系统整体性能
3. **改善用户体验**：减少界面卡顿，提供更流畅的搜索体验
4. **节省带宽**：减少不必要的网络请求

### 测试建议

1. 在搜索框中快速输入字符，验证是否按预期防抖
2. 测试网络较慢环境下的搜索体验
3. 验证各种搜索场景下的功能正确性

## 后续优化建议

1. **可配置防抖时间**：将防抖延迟时间提取为配置项
2. **搜索结果缓存**：对相同搜索条件的结果进行缓存
3. **搜索建议功能**：基于防抖机制添加实时搜索建议
4. **监控指标**：添加搜索请求频率的监控统计

## 风险控制

1. **向后兼容**：保留原有搜索触发方式
2. **逐步部署**：可以通过配置开关控制防抖功能的启用
3. **用户反馈**：收集用户对新搜索体验的反馈

---
