
#  Step 1: Build the Docker Image

    From the OnlineJudge directory
  **docker build -t my-onlinejudge:latest .**

  The Dockerfile (Dockerfile:1-39) will:
  - Use Frontend in fe.
  - Install Python dependencies from deploy/requirements.txt
  - Copy your modified code into the image
  - Set up nginx, gunicorn, and supervisord

  Step 2: Deploy with Docker Compose

  You'll need a docker-compose.yml file (typically from the OnlineJudgeDeploy repo). It should include:
  I've provided it.

  Step 3: Start the Services

  **docker-compose up -d**

  ---
通过浏览器访问服务器的 HTTP 80 端口或者 HTTPS 443 端口，就可以开始使用了。后台管理路径为/admin, 安装过程中自动添加的超级管理员用户名为 root，密码为 rootroot， 请务必及时修改密码。
 ---
 # Method 2: Local Development & Testing

  For development and testing (as shown in init_db.sh:1-19):

  Step 1: Set Up Development Databases

  ./init_db.sh --migrate

  This script:
  - Starts PostgreSQL (port 5435) and Redis (port 6380) containers
  - Runs database migrations
  - Creates a super admin (username: root, password: rootroot)

  Step 2: Run the Development Server

  python manage.py runserver 0.0.0.0:8000

  Or use gunicorn (like production):
  gunicorn oj.wsgi --bind 0.0.0.0:8000 --workers 4

  ---
 #  Method 3: Quick Rebuild & Redeploy

  After making changes to your code:

  ## Stop running containers
  docker-compose down

  ## Rebuild your image
  docker build -t my-onlinejudge:latest .

  ## Restart with new image
  docker-compose up -d

  ---