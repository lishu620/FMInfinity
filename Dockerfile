FROM node:22-alpine

# 设置镜像源为阿里云加速源
RUN sed -i 's|http://dl-cdn.alpinelinux.org/alpine/|https://mirrors.aliyun.com/alpine/|' /etc/apk/repositories

WORKDIR /app

# 复制整个项目（前端 + 后端）
COPY . .

# 设置工作目录到 /app
WORKDIR /app

# 安装依赖（自动编译 sqlite3，解决架构错误）
RUN apk add --no-cache python3 make g++ && npm install

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "app.js"]