require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// 前端（非调试）
// app.use(express.static(__dirname + "/dist"));

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/issue"));
app.use("/api", require("./routes/vote"));

// 初始化数据库
require("./models");

// 启动服务
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});
