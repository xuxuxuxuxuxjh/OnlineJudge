# OnlineJudge 部署指南

## 目录
- [方法一：Docker Compose 生产部署（推荐）](#方法一docker-compose-生产部署推荐)
- [方法二：本地开发测试](#方法二本地开发测试)
- [方法三：快速重新部署](#方法三快速重新部署)
- [常见问题](#常见问题)

---

## 方法一：Docker Compose 生产部署（推荐）

### 前置要求
- Docker 和 Docker Compose 已安装
- Node.js 和 npm（用于构建前端）
- 系统为 Linux 或配置了 WSL2 的 Windows

### 完整部署步骤

#### 步骤 1: 生成安全 TOKEN
```bash
# 生成一个安全的随机 TOKEN
openssl rand -hex 32
```

将生成的 TOKEN 保存，后续配置需要使用。

#### 步骤 2: 配置 docker-compose.yml
编辑 `docker-compose.yml` 文件，将以下两处的 TOKEN 替换为步骤 1 生成的值：
- `oj-judge` 服务的 `TOKEN` 环境变量
- `oj-backend` 服务的 `JUDGE_SERVER_TOKEN` 环境变量

两处必须使用**相同的 TOKEN**。

#### 步骤 3: 构建前端
```bash
cd frontend

# 安装依赖
npm install

# 构建 DLL（必须先执行）
npm run build:dll

# 构建前端项目
npm run build

# 返回项目根目录
cd ..
```

#### 步骤 4: 修复换行符（Windows 用户必须执行）
如果你在 Windows 环境下开发，需要将文件的换行符转换为 Unix 格式：
```bash
# 转换 Dockerfile
sed -i 's/\r$//' Dockerfile

# 转换所有 shell 脚本
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} \;
```

#### 步骤 5: 构建 Docker 镜像
```bash
docker build -t my-onlinejudge-backend:latest .
```

构建过程可能需要几分钟，请耐心等待。

#### 步骤 6: 启动服务
```bash
docker-compose up -d
```

#### 步骤 7: 验证部署
```bash
# 查看容器状态
docker-compose ps

# 查看后端日志
docker logs oj-backend --tail 50

# 等待所有服务健康检查通过
# oj-backend 和 oj-judge 应该显示 (healthy) 状态
```

### 访问系统

- **前端访问**: http://localhost 或 http://YOUR_SERVER_IP
- **后台管理**: http://localhost/admin

**默认管理员账号**:
- 用户名: `root`
- 密码: `rootroot`
- ⚠️ **请务必登录后立即修改密码！**

---

## 方法二：本地开发测试

用于开发和测试环境（不需要 Docker）

### 步骤 1: 启动开发数据库
```bash
./init_db.sh --migrate
```

这个脚本会：
- 启动 PostgreSQL 容器（端口 5435）
- 启动 Redis 容器（端口 6380）
- 运行数据库迁移
- 创建超级管理员（用户名: root，密码: rootroot）

### 步骤 2: 运行开发服务器
```bash
# 使用 Django 开发服务器
python manage.py runserver 0.0.0.0:8000

# 或使用 gunicorn（类似生产环境）
gunicorn oj.wsgi --bind 0.0.0.0:8000 --workers 4
```

### 步骤 3: 启动前端开发服务器
```bash
cd frontend
npm install
npm run dev
```

---

## 方法三：快速重新部署

当代码发生变化后，使用以下命令快速重新部署：

```bash
# 停止运行中的容器
docker-compose down

# 如果前端有修改，重新构建前端
cd frontend
npm run build
cd ..

# 修复换行符（如果有新的 .sh 文件）
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} \;

# 重新构建镜像
docker build -t my-onlinejudge-backend:latest .

# 重新启动服务
docker-compose up -d
```

---

## 常见问题

### 1. 前端构建失败：找不到 vendor-manifest.json

**原因**: 没有先构建 DLL 文件

**解决方案**:
```bash
cd frontend
npm run build:dll
npm run build
```

### 2. Docker 构建失败：illegal option -

**原因**: Dockerfile 或 shell 脚本使用了 Windows 换行符（CRLF）

**解决方案**:
```bash
sed -i 's/\r$//' Dockerfile
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} \;
```

### 3. 后端容器不断重启：exec entrypoint.sh: no such file or directory

**原因**: entrypoint.sh 文件换行符格式错误

**解决方案**:
```bash
sed -i 's/\r$//' deploy/entrypoint.sh
# 重新构建镜像
docker build -t my-onlinejudge-backend:latest .
docker-compose up -d
```

### 4. 判题服务显示 unhealthy

**原因**: 判题服务的 TOKEN 配置不一致或服务尚未完全启动

**解决方案**:
1. 检查 docker-compose.yml 中 `oj-judge` 的 `TOKEN` 和 `oj-backend` 的 `JUDGE_SERVER_TOKEN` 是否相同
2. 等待 1-2 分钟让服务完全启动
3. 查看日志排查问题：`docker logs oj-judge`

### 5. 无法访问 80 端口

**原因**: 端口被占用或防火墙限制

**解决方案**:
```bash
# 检查端口是否被占用
netstat -tulpn | grep :80

# 或修改 docker-compose.yml 中的端口映射
# 将 "0.0.0.0:80:8000" 改为 "0.0.0.0:8080:8000"
# 然后通过 http://localhost:8080 访问
```

---

## 管理命令

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f oj-backend
docker-compose logs -f oj-judge
```

### 重启服务
```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart oj-backend
```

### 停止服务
```bash
# 停止所有服务
docker-compose stop

# 停止并删除容器（数据卷保留）
docker-compose down

# 停止并删除容器和数据卷（危险！会删除所有数据）
docker-compose down -v
```

### 进入容器
```bash
# 进入后端容器
docker exec -it oj-backend sh

# 进入数据库容器
docker exec -it oj-postgres psql -U onlinejudge -d onlinejudge
```

### 数据库操作
```bash
# 运行迁移
docker exec oj-backend python manage.py migrate

# 创建超级用户
docker exec -it oj-backend python manage.py createsuperuser

# 进入 Django shell
docker exec -it oj-backend python manage.py shell
```

---

## 系统架构

部署完成后，系统包含以下服务：

- **oj-backend**: Django 后端服务（端口 80/443）
  - Nginx: 静态文件服务和反向代理
  - Gunicorn: WSGI 应用服务器
  - Dramatiq: 异步任务处理

- **oj-judge**: 判题服务
  - 安全沙箱环境
  - 支持多种编程语言

- **oj-postgres**: PostgreSQL 数据库（端口 5432）

- **oj-redis**: Redis 缓存（端口 6379）

---

## 备份和恢复

### 备份数据库
```bash
docker exec oj-postgres pg_dump -U onlinejudge onlinejudge > backup.sql
```

### 恢复数据库
```bash
docker exec -i oj-postgres psql -U onlinejudge onlinejudge < backup.sql
```

### 备份测试用例
```bash
tar -czf test_cases_backup.tar.gz data/backend/test_case/
```

---

## 安全建议

1. ✅ 修改默认管理员密码
2. ✅ 使用强随机 TOKEN
3. ✅ 配置防火墙规则
4. ✅ 定期备份数据库和测试用例
5. ✅ 及时更新系统和依赖包
6. ✅ 生产环境启用 HTTPS（配置 SSL 证书）

---
