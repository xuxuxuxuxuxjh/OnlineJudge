# AI Modify 功能配置说明

## 功能简介

AI Modify 功能允许用户在代码提交界面使用 GPT-4 API 来优化和改进代码。点击 "AI Modify" 按钮后，系统会将当前代码发送给 GPT-4，返回优化后的代码版本。

## 配置步骤

### 1. 获取 OpenAI API Key

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 注册或登录您的账户
3. 进入 API Keys 页面：https://platform.openai.com/api-keys
4. 创建新的 API Key 并复制保存

### 2. 配置环境变量

#### 方法一：直接在环境中设置（推荐用于开发环境）

```bash
export OPENAI_API_KEY="your-api-key-here"
```

#### 方法二：在 Docker 容器中设置（推荐用于生产环境）

修改 `docker-compose.yml` 文件，在 `oj-backend` 服务的 `environment` 部分添加：

```yaml
oj-backend:
  environment:
    - OPENAI_API_KEY=your-api-key-here
    # ... 其他环境变量
```

#### 方法三：在系统环境中设置（推荐用于生产环境）

在服务器的 `/etc/environment` 或 `.bashrc` 文件中添加：

```bash
export OPENAI_API_KEY="your-api-key-here"
```

然后重新加载环境变量：

```bash
source /etc/environment
# 或
source ~/.bashrc
```

### 3. 重启服务

配置完成后，需要重启后端服务：

```bash
# 如果使用 Docker Compose
docker-compose restart oj-backend

# 如果使用直接运行
# 重启 gunicorn 或 Django 开发服务器
```

## 使用方法

1. 在问题页面编写代码
2. 点击代码编辑器上方的 "AI Modify" 按钮
3. 等待 AI 处理（按钮会显示加载状态）
4. 代码将被自动替换为优化后的版本

## 注意事项

1. **API 费用**：使用 GPT-4 API 会产生费用，请确保您的 OpenAI 账户有足够的余额
2. **请求限制**：OpenAI API 有速率限制，频繁使用可能会遇到限制
3. **代码隐私**：代码会被发送到 OpenAI 的服务器进行处理，请确保符合您的隐私政策
4. **API 密钥安全**：请妥善保管您的 API 密钥，不要将其提交到公共代码仓库

## 故障排除

### 错误：OpenAI API key is not configured

**原因**：环境变量 `OPENAI_API_KEY` 未设置或未正确加载

**解决方法**：
1. 检查环境变量是否正确设置：`echo $OPENAI_API_KEY`
2. 确保在正确的环境中设置（Docker 容器内或系统环境）
3. 重启服务以使环境变量生效

### 错误：OpenAI API error

**可能原因**：
- API 密钥无效或过期
- API 余额不足
- 网络连接问题
- OpenAI 服务暂时不可用

**解决方法**：
1. 检查 API 密钥是否有效
2. 检查 OpenAI 账户余额
3. 检查网络连接
4. 查看后端日志获取详细错误信息

### 错误：Request timeout

**原因**：请求超时（默认 30 秒）

**解决方法**：
- 检查网络连接
- 代码过长可能需要更多时间，可以考虑分块处理

## 安全建议

1. **使用环境变量**：不要将 API 密钥硬编码在代码中
2. **限制访问**：在生产环境中，考虑添加用户权限控制，限制 AI Modify 功能的使用
3. **监控使用**：定期检查 API 使用情况，避免异常使用
4. **密钥轮换**：定期更换 API 密钥以提高安全性

## 技术支持

如有问题，请查看：
- 后端日志：`docker-compose logs oj-backend`
- OpenAI API 文档：https://platform.openai.com/docs/api-reference

