# GitHub Actions CI/CD 自动部署配置指南

> 配置完成后，每次推送代码到 GitHub 主分支，将自动部署到阿里云服务器

---

## 📋 目录

1. [前置准备](#前置准备)
2. [配置 GitHub Secrets](#配置-github-secrets)
3. [启用 GitHub Actions](#启用-github-actions)
4. [测试自动部署](#测试自动部署)
5. [查看部署日志](#查看部署日志)
6. [高级配置](#高级配置)
7. [故障排查](#故障排查)

---

## 前置准备

### 1. 确认项目已推送到 GitHub

```bash
# 检查远程仓库
git remote -v

# 如果没有，添加远程仓库
git remote add origin https://github.com/你的用户名/OnlineJudge.git

# 推送代码
git push -u origin main
```

### 2. 准备服务器信息

你需要以下信息：
- ✅ 服务器 IP：`39.103.63.219`
- ✅ SSH 用户名：`root`
- ✅ SSH 私钥：`~/.ssh/aliyun.pem`

---

## 配置 GitHub Secrets

### 步骤 1: 获取 SSH 私钥内容

在本地 WSL 中运行：

```bash
# 查看私钥内容
cat ~/.ssh/aliyun.pem
```

**复制完整输出**（包括 `-----BEGIN RSA PRIVATE KEY-----` 和 `-----END RSA PRIVATE KEY-----`）

示例：
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...（很长的字符串）...
-----END RSA PRIVATE KEY-----
```

### 步骤 2: 在 GitHub 配置 Secrets

1. **打开 GitHub 仓库页面**
   ```
   https://github.com/你的用户名/OnlineJudge
   ```

2. **进入 Settings**
   - 点击仓库页面右上角的 **Settings**

3. **配置 Secrets**
   - 左侧菜单找到 **Secrets and variables** → **Actions**
   - 点击 **New repository secret**

4. **添加以下 3 个 Secrets**：

#### Secret 1: SERVER_HOST
```
Name: SERVER_HOST
Value: 39.103.63.219
```

#### Secret 2: SERVER_USER
```
Name: SERVER_USER
Value: root
```

#### Secret 3: SSH_PRIVATE_KEY
```
Name: SSH_PRIVATE_KEY
Value: [粘贴你的完整 SSH 私钥内容]
```

**重要提示**：
- ⚠️ Secret 名称必须**完全一致**（区分大小写）
- ⚠️ SSH_PRIVATE_KEY 必须包含完整的私钥（包括开头和结尾的标记）
- ⚠️ 私钥内容不要有额外的空格或换行

### 步骤 3: 验证 Secrets 配置

配置完成后，你应该看到 3 个 Secrets：

```
✅ SERVER_HOST
✅ SERVER_USER
✅ SSH_PRIVATE_KEY
```

---

## 启用 GitHub Actions

### 步骤 1: 推送 Workflow 文件

```bash
# 在项目根目录
cd /mnt/c/Users/wyb/Desktop/code/se/OnlineJudge

# 检查 workflow 文件
ls -la .github/workflows/deploy.yml

# 提交并推送
git add .github/workflows/deploy.yml
git commit -m "feat: add CI/CD auto deploy workflow"
git push
```

### 步骤 2: 启用 Actions

1. 打开 GitHub 仓库
2. 点击顶部的 **Actions** 标签
3. 如果看到提示，点击 **I understand my workflows, go ahead and enable them**

---

## 测试自动部署

### 方式 1: 修改代码触发（推荐）

```bash
# 修改任意文件（例如添加注释）
echo "# Test CI/CD" >> README.md

# 提交并推送
git add .
git commit -m "test: trigger CI/CD deployment"
git push
```

### 方式 2: 手动触发

1. 进入 **Actions** 页面
2. 左侧选择 **Deploy to Aliyun ECS**
3. 点击右侧 **Run workflow** 按钮
4. 选择 `main` 分支
5. 点击 **Run workflow**

---

## 查看部署日志

### 实时查看部署过程

1. 进入 **Actions** 页面
2. 点击最新的 workflow 运行记录
3. 点击 **deploy** 任务
4. 展开各个步骤查看详细日志

### 部署步骤说明

| 步骤 | 说明 | 预计耗时 |
|------|------|---------|
| 📦 Checkout code | 拉取代码 | 5s |
| 🔧 Setup Node.js | 配置 Node.js 环境 | 10s |
| 📦 Install dependencies | 安装前端依赖（包含 `npm run build:dll` 所需包） | 2-5min |
| 🏗️ Build frontend | 顺序执行 `npm run build:dll` 和 `npm run build` | 1-3min |
| 📦 Package project | 打包项目 | 10s |
| 📤 Upload to server | 上传到服务器 | 30s-2min |
| 🚀 Deploy on server | 服务器部署 | 10-15min |
| 🔍 Health Check | 健康检查 | 10s |

**总耗时**：约 15-25 分钟

---

## 高级配置

### 1. 仅在特定文件修改时部署

编辑 `.github/workflows/deploy.yml`：

```yaml
on:
  push:
    branches:
      - main
    paths:  # 只有这些文件变更时才触发
      - 'frontend/**'
      - 'backend/**'
      - '*.py'
      - 'docker-compose.yml'
      - 'Dockerfile'
```

### 2. 添加钉钉/企业微信通知

在 workflow 最后添加：

```yaml
      - name: 📢 Send notification
        if: always()
        run: |
          curl -X POST YOUR_WEBHOOK_URL \
            -H 'Content-Type: application/json' \
            -d '{
              "msgtype": "text",
              "text": {
                "content": "部署状态: ${{ job.status }}"
              }
            }'
```

### 3. 分环境部署

创建多个 workflow：
- `.github/workflows/deploy-dev.yml` - 开发环境
- `.github/workflows/deploy-prod.yml` - 生产环境

### 4. 添加代码测试

在构建前添加测试步骤：

```yaml
      - name: 🧪 Run tests
        run: |
          python -m pytest tests/
```

### 5. 仅前端部署 Workflow

创建 `.github/workflows/deploy-frontend.yml`：

```yaml
name: Deploy Frontend Only

on:
  push:
    branches:
      - main
    paths:
      - 'frontend/**'

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - name: 📦 Checkout code
        uses: actions/checkout@v3

      - name: 🔧 Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: 🏗️ Build frontend
        working-directory: ./frontend
        run: |
          yarn install --legacy-peer-deps
          NODE_OPTIONS=--openssl-legacy-provider yarn build:dll
          NODE_OPTIONS=--openssl-legacy-provider yarn build

      - name: 📤 Deploy frontend
        uses: appleboy/scp-action@v0.1.4
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          source: "frontend/dist"
          target: "/root/OnlineJudge/frontend/"
          strip_components: 2

      - name: 🔄 Restart backend
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /root/OnlineJudge
            docker compose restart oj-backend
```

---

## 故障排查

### 问题 0: 浏览器报 `vendor_xxx_dll is not defined`

**原因**：前端构建时跳过了 `npm run build:dll`，或 workflow 被修改未包含该步骤。

**解决方案**：
1. 确保 workflow 中的构建步骤依次执行 `npm run build:dll` 和 `npm run build`。
2. 若临时在服务器手动构建，也必须保持相同顺序，并在构建完后重新上传整个 `frontend/dist`。

### 问题 1: SSH 连接失败

**错误信息**：
```
Permission denied (publickey)
```

**解决方案**：
1. 检查 `SSH_PRIVATE_KEY` secret 是否完整
2. 确认私钥包含完整的开头和结尾标记
3. 验证服务器 SSH 配置：
   ```bash
   ssh -i ~/.ssh/aliyun.pem root@39.103.63.219 'echo "连接成功"'
   ```

### 问题 2: 服务器磁盘空间不足

**错误信息**：
```
No space left on device
```

**解决方案**：
```bash
ssh -i ~/.ssh/aliyun.pem root@39.103.63.219 << 'EOF'
# 清理 Docker 无用镜像
docker system prune -a -f

# 清理旧的构建文件
cd /root/OnlineJudge
rm -rf frontend/node_modules
rm -f /tmp/*.tar.gz
EOF
```

### 问题 3: 前端构建失败

**错误信息**：
```
Error: error:0308010C:digital envelope routines::unsupported
```

**解决方案**：
已在 workflow 中添加 `NODE_OPTIONS=--openssl-legacy-provider`，如果仍然失败，检查 Node.js 版本。

### 问题 4: Docker 构建超时

**错误信息**：
```
The job running on runner has exceeded the maximum execution time
```

**解决方案**：
增加超时时间，在 job 中添加：

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 60  # 默认 30 分钟，增加到 60
```

### 问题 5: 健康检查失败

**错误信息**：
```
HTTP Status: 502
```

**解决方案**：
1. 增加健康检查等待时间
2. 检查服务器日志：
   ```bash
   ssh -i ~/.ssh/aliyun.pem root@39.103.63.219 'docker logs oj-backend --tail 50'
   ```

---

## 📊 CI/CD 流程图

```
┌─────────────────┐
│  开发者 Push 代码  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GitHub Actions   │
│   自动触发       │
└────────┬────────┘
         │
         ├──► 📦 拉取代码
         ├──► 🔧 配置环境
         ├──► 📦 安装依赖
         ├──► 🏗️ 构建前端
         ├──► 📦 打包项目
         ├──► 📤 上传到服务器
         │
         ▼
┌─────────────────┐
│  阿里云服务器     │
└────────┬────────┘
         │
         ├──► 🔄 停止服务
         ├──► 📦 解压更新
         ├──► 🏗️ 构建镜像
         ├──► 🚀 启动服务
         ├──► ⏳ 等待就绪
         ├──► ✅ 健康检查
         │
         ▼
┌─────────────────┐
│   部署完成 🎉    │
└─────────────────┘
```

---

## 🎯 最佳实践

### 1. 使用分支保护

在 GitHub 仓库设置中：
- Settings → Branches
- 添加 `main` 分支保护规则
- 要求 Pull Request 审核后才能合并

### 2. 添加部署标签

每次部署成功后自动打标签：

```yaml
      - name: 🏷️ Create release tag
        if: success()
        run: |
          git tag -a "v$(date +%Y%m%d-%H%M%S)" -m "Auto deploy"
          git push --tags
```

### 3. 回滚机制

保留最近 3 个版本的镜像：

```yaml
      - name: 💾 Backup old image
        run: |
          ssh ... 'docker tag my-onlinejudge-backend:latest my-onlinejudge-backend:backup-$(date +%Y%m%d)'
```

### 4. 监控告警

集成监控服务（如 Sentry、Prometheus）

---

## 🔐 安全建议

1. ✅ **定期更换 SSH 密钥**
2. ✅ **使用 GitHub Deploy Keys**（只读权限）
3. ✅ **限制服务器 IP 白名单**
4. ✅ **不要在代码中硬编码敏感信息**
5. ✅ **定期审查 workflow 日志**

---

## 📝 验证清单

配置完成后确认：

- [ ] GitHub Secrets 已正确配置
- [ ] Workflow 文件已推送到仓库
- [ ] Actions 已启用
- [ ] 测试部署成功
- [ ] 健康检查通过
- [ ] 服务可以正常访问

---

## 🎓 学习资源

- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [GitHub Actions Marketplace](https://github.com/marketplace?type=actions)
- [Docker 官方文档](https://docs.docker.com/)

---

**最后更新**: 2025-11-17
**维护者**: OnlineJudge Team
