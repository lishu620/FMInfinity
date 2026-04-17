const jwt = require("jsonwebtoken");
const { User, Status } = require("../models");

const JWT_SECRET = process.env.JWT_SECRET || "music-vote-secret-key";

// 验证登录
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "未登录" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.userId, { include: Status });
    if (!user) return res.status(401).json({ message: "用户不存在" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token无效" });
  }
};

// 验证超级管理员
const isSuperAdmin = (req, res, next) => {
  if (req.user.Status.name !== "admin") {
    return res.status(403).json({ message: "无权限" });
  }
  next();
};

// 验证组管理员
const isGroupAdmin = (req, res, next) => {
  if (!req.user.isGroupAdmin) {
    return res.status(403).json({ message: "无组管理员权限" });
  }
  next();
};

// 验证稿件管理员
const isIssueAdmin = async (req, res, next) => {
  const issueId = req.params.issueId || req.params.id;

  if (!issueId) {
    return res.status(400).json({ message: "缺少稿件ID" });
  }

  if (req.user.Status.name === "admin") return next();

  const { IssueAdmin } = require("../models");

  const isAdmin = await IssueAdmin.findOne({
    where: { issueId, userId: req.user.id },
  });

  if (!isAdmin) {
    return res.status(403).json({ message: "无本期稿件管理员权限" });
  }

  next();
};

module.exports = {
  authMiddleware,
  isSuperAdmin, // 必须导出
  isGroupAdmin,
  isIssueAdmin,
  JWT_SECRET,
};
