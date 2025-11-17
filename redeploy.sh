#!/bin/bash
# OnlineJudge 快速重新部署脚本
# 使用方法: chmod +x redeploy.sh && ./redeploy.sh

set -e

# 配置
SERVER_IP="39.103.63.219"
SSH_KEY="$HOME/.ssh/aliyun.pem"
PROJECT_DIR="/mnt/c/Users/wyb/Desktop/code/se/OnlineJudge"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 OnlineJudge 快速重新部署${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# 检查是否在项目目录
if [ ! -f "manage.py" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 选择部署模式
echo -e "${YELLOW}请选择部署模式:${NC}"
echo "  1) 仅前端"
echo "  2) 仅后端"
echo "  3) 前后端全部"
echo ""
read -p "输入选项 [1-3]: " DEPLOY_MODE

case $DEPLOY_MODE in
    1)
        echo -e "${GREEN}📦 模式: 仅部署前端${NC}"
        ;;
    2)
        echo -e "${GREEN}📦 模式: 仅部署后端${NC}"
        ;;
    3)
        echo -e "${GREEN}📦 模式: 部署前后端${NC}"
        ;;
    *)
        echo -e "${RED}❌ 无效选项${NC}"
        exit 1
        ;;
esac

echo ""

# ===== 前端部署 =====
if [ "$DEPLOY_MODE" = "1" ] || [ "$DEPLOY_MODE" = "3" ]; then
    echo -e "${BLUE}📦 步骤 1: 构建前端...${NC}"
    cd frontend

    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        echo "安装依赖..."
        yarn install --legacy-peer-deps
    fi

    # 设置环境变量
    export NODE_OPTIONS=--openssl-legacy-provider

    # 构建
    echo "构建中..."
    yarn build

    if [ ! -d "dist" ]; then
        echo -e "${RED}❌ 前端构建失败${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ 前端构建完成${NC}"
    cd ..

    # 打包前端
    echo -e "${BLUE}📦 步骤 2: 打包前端文件...${NC}"
    tar -czf /tmp/frontend-dist.tar.gz frontend/dist/

    # 上传
    echo -e "${BLUE}📤 步骤 3: 上传到服务器...${NC}"
    scp -i $SSH_KEY /tmp/frontend-dist.tar.gz root@$SERVER_IP:/tmp/

    # 部署前端
    echo -e "${BLUE}🔧 步骤 4: 部署前端...${NC}"
    ssh -i $SSH_KEY root@$SERVER_IP << 'ENDSSH'
cd /root/OnlineJudge
rm -rf frontend/dist
mkdir -p frontend
cd frontend
tar -xzf /tmp/frontend-dist.tar.gz
rm /tmp/frontend-dist.tar.gz
cd ..
docker compose restart oj-backend
sleep 5
echo "✅ 前端部署完成"
ENDSSH

    echo -e "${GREEN}✅ 前端重新部署完成${NC}"
    echo ""
fi

# ===== 后端部署 =====
if [ "$DEPLOY_MODE" = "2" ] || [ "$DEPLOY_MODE" = "3" ]; then
    echo -e "${BLUE}📦 步骤 1: 打包后端代码...${NC}"
    tar -czf /tmp/backend-code.tar.gz \
      --exclude='frontend/node_modules' \
      --exclude='frontend/dist' \
      --exclude='node_modules' \
      --exclude='data' \
      --exclude='.git' \
      --exclude='.claude' \
      --exclude='*.pyc' \
      --exclude='__pycache__' \
      .

    echo -e "${BLUE}📤 步骤 2: 上传到服务器...${NC}"
    scp -i $SSH_KEY /tmp/backend-code.tar.gz root@$SERVER_IP:/tmp/

    echo -e "${BLUE}🔧 步骤 3: 服务器端部署...${NC}"
    ssh -i $SSH_KEY root@$SERVER_IP << 'ENDSSH'
set -e

cd /root/OnlineJudge

echo "停止服务..."
docker compose down

echo "更新代码..."
tar -xzf /tmp/backend-code.tar.gz
rm /tmp/backend-code.tar.gz

echo "重新构建镜像（需要 10-15 分钟）..."
docker build -t my-onlinejudge-backend:latest .

echo "启动服务..."
docker compose up -d

echo "等待服务启动..."
sleep 30

echo "检查服务状态..."
docker compose ps

echo "✅ 后端部署完成"
ENDSSH

    echo -e "${GREEN}✅ 后端重新部署完成${NC}"
    echo ""
fi

# 测试访问
echo -e "${BLUE}🔍 测试访问...${NC}"
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$SERVER_IP)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTP 状态: $HTTP_CODE${NC}"
else
    echo -e "${YELLOW}⚠️  HTTP 状态: $HTTP_CODE${NC}"
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}🎉 部署完成！${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "访问地址: ${BLUE}http://$SERVER_IP${NC}"
echo -e "管理后台: ${BLUE}http://$SERVER_IP/admin${NC}"
echo ""
echo -e "管理员账号: ${YELLOW}root${NC}"
echo -e "默认密码: ${YELLOW}rootroot${NC}"
echo ""
echo -e "${YELLOW}💡 提示: 按 Ctrl+F5 强制刷新浏览器缓存${NC}"
echo ""

# 清理临时文件
rm -f /tmp/frontend-dist.tar.gz /tmp/backend-code.tar.gz

exit 0
