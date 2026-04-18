const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, Status } = require("../models");
const { Op } = require("sequelize");
const {
  authMiddleware,
  isSuperAdmin,
  isGroupAdmin,
  JWT_SECRET,
} = require("../middleware/auth");

// 登录接口
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username }, include: Status });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ message: "账号或密码错误" });
  }

  // 封禁用户禁止登录
  if (user.isBanned) {
    return res.status(403).json({ message: "账号已被封禁，请联系管理员" });
  }

  // 未审核用户禁止登录（admin 组除外）
  if (user.Status.id !== 1 && !user.isApproved) {
    return res
      .status(403)
      .json({ message: "账号待审核，请等待管理员通过后再登录" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      group: user.Status.name,
      isGroupAdmin: user.isGroupAdmin,
      isSuperAdmin: user.Status.name === "admin",
      isBanned: user.isBanned,
    },
  });
});

// 获取当前用户信息
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    nickname: req.user.nickname,
    group: req.user.Status.name,
    isGroupAdmin: req.user.isGroupAdmin,
    isSuperAdmin: req.user.Status.name === "admin",
  });
});

// 修改个人信息(昵称/密码)
router.put("/me", authMiddleware, async (req, res) => {
  const { nickname, oldPassword, newPassword } = req.body;
  const user = req.user;

  if (nickname) user.nickname = nickname;
  if (oldPassword && newPassword) {
    if (!(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(400).json({ message: "原密码错误" });
    }
    user.password = await bcrypt.hash(newPassword, 10);
  }

  await user.save();
  res.json({ message: "修改成功" });
});

// 组管理员/超管查看用户
router.get("/group/users", authMiddleware, async (req, res) => {
  try {
    if (req.user.Status.name !== "admin" && !req.user.isGroupAdmin) {
      return res.status(403).json({ message: "无权限" });
    }

    let where = {};

    if (req.user.Status.name === "admin") {
      where = {};
    } else {
      where = {
        statusId: req.user.statusId,
        isGroupAdmin: false,
      };
    }

    const users = await User.findAll({
      where,
      attributes: [
        "id",
        "username",
        "nickname",
        "isGroupAdmin",
        "statusId",
        "isBanned",
        "isApproved",
      ],
      include: { model: Status, attributes: ["name"] },
      order: [["id", "ASC"]],
    });

    res.json(users);
  } catch (err) {
    console.error("获取用户列表失败:", err);
    res.status(500).json({ message: "获取用户列表失败" });
  }
});

// 组管理员/超管重置用户密码
router.put("/user/:id/reset-pwd", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findByPk(id);

    if (!targetUser) {
      return res.status(404).json({ message: "用户不存在" });
    }

    if (req.user.Status.name !== "admin" && !req.user.isGroupAdmin) {
      return res.status(403).json({ message: "无权限" });
    }

    if (req.user.Status.name !== "admin") {
      if (
        targetUser.statusId !== req.user.statusId ||
        targetUser.isGroupAdmin
      ) {
        return res.status(403).json({ message: "无权限" });
      }
    }

    targetUser.password = await bcrypt.hash("admin@123", 10);
    await targetUser.save();

    res.json({ message: "密码已重置为admin@123" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "重置密码失败" });
  }
});

// 获取所有用户组
router.get("/status", authMiddleware, async (req, res) => {
  const statusList = await Status.findAll();
  res.json(statusList);
});

router.get("/status/public", async (req, res) => {
  const statusList = await Status.findAll({
    attributes: ["id", "name"],
    where: {
      name: { [Op.ne]: "admin" },
    },
  });
  res.json(statusList);
});

// 用户注册（可选择组 + 待审核）
router.post("/register", async (req, res) => {
  try {
    const { username, nickname, password, statusId } = req.body;

    if (!statusId) {
      return res.status(400).json({ message: "请选择用户组" });
    }

    const exist = await User.findOne({ where: { username } });
    if (exist) {
      return res.status(400).json({ message: "账号已存在" });
    }

    const hashedPwd = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      nickname,
      password: hashedPwd,
      statusId: statusId,
      isGroupAdmin: false,
      isApproved: false,
    });

    res.json({ message: "注册成功，请等待管理员审核" });
  } catch (err) {
    res.status(500).json({ message: "注册失败" });
  }
});

// ==============================================
// 👇 组管理功能（仅超级管理员可操作）
// ==============================================

// 创建用户组
router.post("/status", authMiddleware, isSuperAdmin, async (req, res) => {
  const { name, description } = req.body;
  const exist = await Status.findOne({ where: { name } });
  if (exist) return res.status(400).json({ message: "组名已存在" });
  const status = await Status.create({ name, description });
  res.json(status);
});

// 更新用户组
router.put("/status/:id", authMiddleware, isSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const status = await Status.findByPk(id);
  if (!status) return res.status(404).json({ message: "组不存在" });

  if (name) status.name = name;
  if (description) status.description = description;
  await status.save();

  res.json(status);
});

// 删除用户组（不能删除 admin 组，不能删除有用户的组）
router.delete("/status/:id", authMiddleware, isSuperAdmin, async (req, res) => {
  const { id } = req.params;

  const status = await Status.findByPk(id);
  if (!status) return res.status(404).json({ message: "组不存在" });
  if (status.name === "admin")
    return res.status(400).json({ message: "不能删除超级管理员组" });

  const userCount = await User.count({ where: { statusId: id } });
  if (userCount > 0)
    return res.status(400).json({ message: "组内有用户，无法删除" });

  await status.destroy();
  res.json({ message: "删除成功" });
});

// 获取指定组的管理员列表
router.get("/status/:id/admins", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const admins = await User.findAll({
    where: { statusId: id, isGroupAdmin: true },
    attributes: ["id", "username", "nickname"],
  });
  res.json(admins);
});

// 删除用户（仅超级管理员）
router.delete("/user/:id", authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findByPk(id);

    if (!targetUser) {
      return res.status(404).json({ message: "用户不存在" });
    }

    // 不能删除自己
    if (targetUser.id === req.user.id) {
      return res.status(400).json({ message: "不能删除自己" });
    }

    // 从你的表看，statusId=1 就是 admin 组，直接用这个判断
    if (targetUser.statusId === 1) {
      return res.status(400).json({ message: "不能删除超级管理员" });
    }

    await targetUser.destroy();
    res.json({ message: "用户已删除" });
  } catch (err) {
    console.error("删除用户失败:", err);
    res.status(500).json({ message: "删除用户失败" });
  }
});

// 设置/取消组管理员
router.put(
  "/status/:id/admin/:userId",
  authMiddleware,
  isSuperAdmin,
  async (req, res) => {
    const { id, userId } = req.params;
    const { isGroupAdmin } = req.body;

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "用户不存在" });
    if (user.statusId !== parseInt(id))
      return res.status(400).json({ message: "用户不属于该组" });

    user.isGroupAdmin = isGroupAdmin;
    await user.save();
    res.json({ message: "操作成功" });
  },
);

// 获取待审核用户列表
router.get("/pending-users", authMiddleware, async (req, res) => {
  try {
    if (req.user.Status.name !== "admin" && !req.user.isGroupAdmin) {
      return res.status(403).json({ message: "无权限" });
    }

    let where = { isApproved: false };

    if (req.user.Status.name !== "admin") {
      where.statusId = req.user.statusId;
      where.isGroupAdmin = false;
    }

    const users = await User.findAll({
      where,
      attributes: [
        "id",
        "username",
        "nickname",
        "statusId",
        "isGroupAdmin",
        "isApproved",
        "isBanned",
      ],
      include: { model: Status, attributes: ["name"] },
      order: [["id", "ASC"]],
    });

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取待审核用户失败" });
  }
});

// 审核通过用户
router.post("/approve/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.Status.name !== "admin" && !req.user.isGroupAdmin) {
      return res.status(403).json({ message: "无权限" });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "用户不存在" });

    if (req.user.Status.name !== "admin") {
      if (user.statusId !== req.user.statusId || user.isGroupAdmin) {
        return res.status(403).json({ message: "无权限审核该用户" });
      }
    }

    user.isApproved = true;
    await user.save();

    res.json({ message: "审核通过" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "审核失败" });
  }
});
// 拒绝/删除待审核用户
router.post("/reject/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.Status.name !== "admin" && !req.user.isGroupAdmin) {
      return res.status(403).json({ message: "无权限" });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "用户不存在" });

    if (req.user.Status.name !== "admin") {
      if (user.statusId !== req.user.statusId || user.isGroupAdmin) {
        return res.status(403).json({ message: "无权限操作该用户" });
      }
    }

    await user.destroy();
    res.json({ message: "已拒绝并删除用户" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "操作失败" });
  }
});

// 切换组管理员状态
router.put(
  "/user/:id/group-admin",
  authMiddleware,
  isSuperAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { isGroupAdmin } = req.body;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: "用户不存在" });

    user.isGroupAdmin = isGroupAdmin;
    await user.save();
    res.json({ message: "操作成功" });
  },
);

// 超管创建用户
router.post("/user", authMiddleware, isSuperAdmin, async (req, res) => {
  const { username, nickname, statusId, isGroupAdmin } = req.body;
  const hashedPwd = await bcrypt.hash("admin@123", 10);

  const user = await User.create({
    username,
    nickname,
    password: hashedPwd,
    statusId,
    isGroupAdmin: isGroupAdmin || false,
    isApproved: true,
  });

  res.json({ id: user.id, username: user.username, nickname: user.nickname });
});

// 封禁/解封用户（仅超管）
router.put("/user/:id/ban", authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isBanned } = req.body;

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: "用户不存在" });

    if (user.id === req.user.id) {
      return res.status(400).json({ message: "不能封禁自己" });
    }

    const targetUser = await User.findByPk(id, { include: Status });
    if (!targetUser) {
      return res.status(404).json({ message: "用户不存在" });
    }

    if (targetUser.Status?.name === "admin") {
      return res.status(400).json({ message: "不能封禁超级管理员" });
    }

    targetUser.isBanned = isBanned;
    await targetUser.save();

    res.json({ message: "操作成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "服务器错误" });
  }
});

module.exports = router;
