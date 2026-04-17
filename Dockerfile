FROM node:22-alpine

WORKDIR /app

# 复制整个项目（前端 + 后端）
COPY . .

# 安装依赖（自动编译 sqlite3，解决架构错误）
WORKDIR /app/backend
RUN apk add --no-cache python3 make g++
RUN npm install

# 端口
EXPOSE 3000

# 启动
CMD ["node", "app.js"]