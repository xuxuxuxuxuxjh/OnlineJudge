# OnlineJudge Docker 部署指南

> 适用于 Windows + WSL2 + Ubuntu 22.04 环境

## 📋 目录

1. [环境准备](#环境准备)
2. [Docker配置](#docker配置)
3. [项目部署](#项目部署)
4. [前端构建](#前端构建)
5. [访问系统](#访问系统)
6. [常见问题](#常见问题)

---

## 环境准备

### 1. 安装WSL2和Ubuntu

在Windows PowerShell（管理员）中运行：

```powershell
# 安装WSL2
wsl --install

# 或者安装指定版本
wsl --install -d Ubuntu-22.04

# 重启电脑
```

### 2. 重置WSL密码（如果需要）

如果忘记密码，在PowerShell（管理员）中运行：

```powershell
# 以root用户身份运行
wsl -u root passwd 你的用户名

# 输入新密码两次
```

### 3. 安装Docker Desktop

1. 从[Docker官网](https://www.docker.com/products/docker-desktop)下载Docker Desktop for Windows
2. 双击安装程序，确保勾选 **"Use WSL 2 instead of Hyper-V"**
3. 安装完成后重启电脑
4. 启动Docker Desktop

### 4. 配置Docker Desktop

**配置WSL集成：**

1. 打开Docker Desktop设置（右上角齿轮图标 ⚙️）
2. 进入 **Settings** → **Resources** → **WSL Integration**
3. 启用以下选项：
   - ✅ `Enable integration with my default WSL distro`
   - ✅ 找到 `Ubuntu-22.04` 并开启
4. 点击 **Apply & Restart**

**配置镜像加速器（解决网络问题）：**

1. 进入 **Settings** → **Docker Engine**
2. 修改JSON配置：

```json
{
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false,
  "registry-mirrors": [
    "https://dockerproxy.com",
    "https://docker.m.daocloud.io",
    "https://docker.nju.edu.cn"
  ]
}
```

3. 点击 **Apply & Restart**

---

## Docker配置

### 验证Docker安装

在WSL Ubuntu终端中运行：

```bash
# 检查Docker版本
docker --version
docker compose version

# 测试Docker
docker run hello-world
```

---

## 项目部署

### 1. 克隆项目

```bash
# 进入home目录
cd ~

# 克隆项目
git clone https://github.com/xuxuxuxuxuxjh/OnlineJudge.git

# 进入项目目录
cd OnlineJudge
```

### 2. 创建数据目录

```bash
# 创建必要的数据存储目录
mkdir -p data/backend/test_case
mkdir -p data/judge_server/log
mkdir -p data/judge_server/run
mkdir -p data/redis
```

### 3. 启动Docker容器

```bash
# 构建并启动所有服务
docker compose up -d --build

# 查看容器状态（所有容器应该是 Up 状态）
docker ps -a
```

应该看到4个容器：
- `oj-redis`
- `oj-postgres`
- `oj-judge`
- `oj-backend`

---

## 前端构建

### 1. 安装Node.js

```bash
# 安装Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y

> 可能会出现提醒 DEPRECATION WARNING Node.js 18.x is no longer actively supported! 但对于这个项目来说Node.js 18足够了。

# 验证安装
node --version  # 应该显示 v18.x.x
npm --version   # 应该显示 10.x.x
which npm       # 应该显示 /usr/bin/npm
```

### 2. 安装Yarn

```bash
# 全局安装yarn
sudo npm install -g yarn

# 验证安装
yarn --version
```

### 3. 构建前端

```bash
# 进入frontend目录
cd ~/OnlineJudge/frontend

# 设置环境变量（解决OpenSSL兼容性问题）
export NODE_OPTIONS=--openssl-legacy-provider

# 清理旧文件
rm -rf node_modules package-lock.json dist

# 安装依赖（忽略postinstall脚本避免WSL路径问题）
npm install --legacy-peer-deps --ignore-scripts

# 或使用yarn（推荐）
yarn install --ignore-scripts

# 构建DLL
yarn run build:dll

# 构建前端
yarn build

# 验证构建结果
ls -la dist/
```

成功后应该看到：
```
dist/
├── admin/
├── index.html
└── static/
```

### 4. 重启Backend容器

```bash
# 返回主目录
cd ~/OnlineJudge

# 重启backend容器以加载前端文件
docker compose restart oj-backend

# 查看日志确认启动成功
docker compose logs -f oj-backend
```

---

## 访问系统

### 1. 创建管理员账号

```bash
# 进入backend容器
docker exec -it oj-backend /bin/sh

# 创建超级管理员
python manage.py createsuperuser

# 按提示输入：
# - 用户名（例如：admin）
# - 邮箱（例如：admin@example.com）
# - 密码（输入两次）

# 退出容器
exit
```

### 2. 访问网站

在Windows浏览器中打开：

**前台页面：**
```
http://localhost
```

**管理后台：**
```
http://localhost/admin
```

使用刚才创建的管理员账号登录。

---

## 常见问题

### Q1: 端口被占用

**问题：** 80或443端口已被占用

**解决方案：** 修改 `docker-compose.yml` 中的端口映射

```yaml
ports:
  - "8080:8000"   # 改用8080端口
  - "8443:1443"   # 改用8443端口
```

然后访问 `http://localhost:8080`

### Q2: 前端显示403 Forbidden

**问题：** 访问localhost显示403

**解决方案：** 前端未构建或构建失败

```bash
# 重新构建前端
cd ~/OnlineJudge/frontend
export NODE_OPTIONS=--openssl-legacy-provider
yarn build

# 重启容器
cd ~/OnlineJudge
docker compose restart oj-backend
```

### Q3: Docker镜像下载失败

**问题：** 提示无法连接到Docker Hub

**解决方案：** 配置镜像加速器（见Docker配置章节）

### Q4: npm构建时报OpenSSL错误

**问题：** `Error: error:0308010C:digital envelope routines::unsupported`

**解决方案：** 设置环境变量

```bash
export NODE_OPTIONS=--openssl-legacy-provider
```

### Q5: 容器启动失败

**问题：** 某个容器状态为Exited

**解决方案：** 查看日志排查

```bash
# 查看所有容器日志
docker compose logs

# 查看特定容器日志
docker compose logs oj-backend
docker compose logs oj-postgres
```

---

## 常用管理命令

### Docker命令

```bash
# 查看所有容器状态
docker compose ps

# 查看容器日志
docker compose logs [服务名]
docker compose logs -f  # 实时查看

# 重启服务
docker compose restart [服务名]

# 停止所有服务
docker compose down

# 重新构建并启动
docker compose up -d --build

# 进入容器
docker exec -it oj-backend /bin/sh
```

### 数据库操作

```bash
# 进入backend容器
docker exec -it oj-backend /bin/sh

# Django管理命令
python manage.py migrate           # 运行数据库迁移
python manage.py createsuperuser  # 创建管理员
python manage.py shell            # 进入Django shell

# 退出
exit
```

### 前端重新构建

```bash
cd ~/OnlineJudge/frontend

# 设置环境变量
export NODE_OPTIONS=--openssl-legacy-provider

# 重新构建
yarn build

# 重启容器
cd ~/OnlineJudge
docker compose restart oj-backend
```

---

## 系统维护

### 备份数据

```bash
# 备份数据库
docker exec oj-postgres pg_dump -U onlinejudge onlinejudge > backup.sql

# 备份上传的文件
cp -r ~/OnlineJudge/data/backend ~/OnlineJudge_backup/
```

### 更新系统

```bash
# 拉取最新代码
cd ~/OnlineJudge
git pull

# 重新构建容器
docker compose down
docker compose up -d --build

# 运行数据库迁移
docker exec -it oj-backend python manage.py migrate
```

### 清理磁盘空间

```bash
# 清理未使用的Docker资源
docker system prune -a

# 清理前端node_modules
cd ~/OnlineJudge/frontend
rm -rf node_modules
```

---

## 性能优化建议

1. **生产环境配置：**
   - 修改 `docker-compose.yml` 中的环境变量
   - 设置 `FORCE_HTTPS=1` 启用HTTPS
   - 配置 `STATIC_CDN_HOST` 使用CDN

2. **数据库优化：**
   - 定期备份数据库
   - 配置PostgreSQL参数优化性能

3. **判题服务器扩展：**
   - 可以通过增加judge容器数量来提高并发判题能力
   - 修改 `docker-compose.yml` 添加多个judge服务

---

## 参考资源

- [OnlineJudge官方文档](http://opensource.qduoj.com/)
- [Docker官方文档](https://docs.docker.com/)
- [WSL官方文档](https://docs.microsoft.com/en-us/windows/wsl/)

---

## 故障排除清单

遇到问题时，按顺序检查：

- [ ] Docker Desktop是否正在运行
- [ ] 所有容器是否都在运行（`docker ps -a`）
- [ ] 前端是否已构建（`ls ~/OnlineJudge/frontend/dist/`）
- [ ] 端口是否被占用（`netstat -ano | findstr :80`）
- [ ] 防火墙是否阻止访问
- [ ] 查看容器日志（`docker compose logs`）

---

## 总结

本指南涵盖了从零开始在Windows + WSL2环境下部署OnlineJudge的完整流程。关键步骤包括：

1. ✅ 配置WSL2和Docker Desktop
2. ✅ 配置Docker镜像加速器
3. ✅ 安装Node.js并构建前端
4. ✅ 启动Docker容器
5. ✅ 创建管理员账号并访问系统

**部署成功后，记得：**
- 修改默认管理员密码
- 配置系统设置
- 定期备份数据

祝使用愉快！🎉
