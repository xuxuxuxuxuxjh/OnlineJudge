# CI/CD 自动部署 - 快速开始

> 5 分钟配置，实现代码推送自动部署

---

## 🚀 快速配置（3 步）

### 第 1 步：复制 SSH 私钥

```bash
# 在 WSL 中运行
cat ~/.ssh/aliyun.pem
```

**完整复制输出内容**（包括开头和结尾）

---

### 第 2 步：配置 GitHub Secrets

1. 打开 GitHub 仓库：https://github.com/你的用户名/OnlineJudge
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**，添加以下 3 个：

```
名称: SERVER_HOST
值:   39.103.63.219
```

```
名称: SERVER_USER
值:   root
```

```
名称: SSH_PRIVATE_KEY
值:   [粘贴步骤1复制的完整私钥]
```

---

### 第 3 步：推送代码触发部署

```bash
# 在项目目录
cd /mnt/c/Users/wyb/Desktop/code/se/OnlineJudge

# 推送代码
git add .
git commit -m "feat: enable CI/CD auto deploy"
git push
```

**完成！** 🎉

进入 GitHub 仓库的 **Actions** 页面查看部署进度。

---

## 📂 已创建的文件

### 1. 完整部署 Workflow
**文件**：`.github/workflows/deploy.yml`

**触发条件**：
- 推送代码到 `main` 分支
- 手动触发

**部署内容**：前端 + 后端（完整重新构建）

**耗时**：约 15-25 分钟

---

### 2. 前端快速部署 Workflow
**文件**：`.github/workflows/deploy-frontend.yml`

**触发条件**：
- 修改 `frontend/` 目录下的文件
- 手动触发

**部署内容**：仅前端（无需重新构建后端镜像）

**耗时**：约 3-5 分钟

---

### 3. 详细配置指南
**文件**：`CI-CD自动部署配置指南.md`

包含：
- 完整配置步骤
- 高级配置选项
- 故障排查
- 安全建议

---

## 🎯 使用场景

### 场景 1: 修改前端代码

```bash
# 修改前端 Vue 组件
vim frontend/src/pages/oj/views/problem/ProblemList.vue

# 提交推送
git add .
git commit -m "fix: update problem list UI"
git push
```

✅ **自动触发**：`deploy-frontend.yml` （3-5 分钟）
> ⚠️ 该 workflow 内部会先 `npm run build:dll` 再 `npm run build`，无需手动补这个步骤。

---

### 场景 2: 修改后端代码

```bash
# 修改后端 Python 代码
vim submission/views/oj.py

# 提交推送
git add .
git commit -m "feat: add new API endpoint"
git push
```

✅ **自动触发**：`deploy.yml` （15-25 分钟）

---

### 场景 3: 同时修改前后端

```bash
# 修改前后端代码
# ...

# 提交推送
git add .
git commit -m "feat: add new feature"
git push
```

✅ **自动触发**：`deploy.yml` （完整部署）

---

## 📊 部署流程对比

| 方式 | 触发方式 | 部署时间 | 适用场景 |
|------|---------|---------|---------|
| **手动部署** | 运行 `./redeploy.sh` | 需要本地操作 | 本地测试 |
| **CI/CD 完整部署** | Git push | 15-25分钟 | 后端修改 |
| **CI/CD 前端部署** | Git push | 3-5分钟 | 前端修改 |

---

## 🔍 查看部署状态

### 方式 1: GitHub Actions 页面

1. 打开 https://github.com/你的用户名/OnlineJudge/actions
2. 查看最新的 workflow 运行状态
3. 点击查看详细日志

### 方式 2: 命令行查看

```bash
# 使用 GitHub CLI (需要先安装 gh)
gh run list
gh run view
```

---

## ⚡ 手动触发部署

不修改代码也可以手动触发部署：

1. 进入 **Actions** 页面
2. 选择要运行的 workflow
3. 点击 **Run workflow**
4. 选择 `main` 分支
5. 点击绿色的 **Run workflow** 按钮

---

## 🛠️ 常见问题

### Q1: 如何停用自动部署？

**方法 1**：禁用 workflow
- 进入 Actions 页面
- 选择 workflow
- 点击右上角 `...` → Disable workflow

**方法 2**：删除 workflow 文件
```bash
git rm .github/workflows/deploy.yml
git commit -m "chore: disable CI/CD"
git push
```

### Q2: 部署失败怎么办？

1. 查看 Actions 日志找到错误信息
2. 参考 `CI-CD自动部署配置指南.md` 的故障排查章节
3. 修复问题后重新推送代码

### Q3: 如何只在特定分支部署？

修改 `.github/workflows/deploy.yml`：

```yaml
on:
  push:
    branches:
      - main      # 主分支
      - develop   # 开发分支
```

### Q4: 可以部署到多个服务器吗？

可以！创建多个 Secrets：
- `PROD_SERVER_HOST` / `DEV_SERVER_HOST`
- `PROD_SSH_KEY` / `DEV_SSH_KEY`

创建不同的 workflow 文件使用不同的 Secrets。

---

## 🎓 下一步

- ✅ 阅读完整的 `CI-CD自动部署配置指南.md`
- ✅ 配置钉钉/企业微信通知
- ✅ 添加自动化测试
- ✅ 配置分环境部署

---

## 📞 需要帮助？

- 查看详细文档：`CI-CD自动部署配置指南.md`
- 查看 GitHub Actions 日志
- 检查服务器状态：`docker compose ps`

---

**最后更新**: 2025-11-17

---

## 🎉 恭喜！

现在你的 OnlineJudge 项目已经实现了现代化的 CI/CD 自动部署！

每次 `git push` 后，GitHub Actions 会自动：
1. ✅ 构建前端
2. ✅ 打包项目
3. ✅ 上传到服务器
4. ✅ 自动部署
5. ✅ 健康检查

**享受自动化带来的效率提升吧！** 🚀
