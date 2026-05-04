require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API 路由
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/issue"));
app.use("/api", require("./routes/vote"));
app.use("/api", require("./routes/vsingers"));
app.use("/api", require("./routes/daily"));

// 前端代理
app.use(express.static(path.join(__dirname, "dist")));
app.use(function (req, res, next) {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// 初始化数据库
require("./models");

// 启动服务
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});
