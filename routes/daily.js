const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { User, DailyCopy } = require("../models");
const axios = require("axios");

// 提取 BV 号
function extractBvid(url) {
  if (!url) return null;
  const match = url.match(/BV([A-Za-z0-9]+)/);
  if (match) return "BV" + match[1];
  return null;
}

// 获取 B 站封面
async function getBilibiliCover(bvid) {
  if (!bvid) return null;
  try {
    const res = await axios.get(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    );
    if (res.data?.data?.pic) {
      return res.data.data.pic;
    }
    return null;
  } catch (err) {
    console.error("获取B站封面失败:", err);
    return null;
  }
}

// 获取所有每日文案（所有人可看）
router.get("/daily", async (req, res) => {
  try {
    const list = await DailyCopy.findAll({
      include: [{ model: User, attributes: ["id", "nickname"] }],
      order: [["id", "DESC"]],
    });

    const result = await Promise.all(
      list.map(async (item) => {
        const data = item.toJSON();
        data.cover = await getBilibiliCover(data.bvid);
        return data;
      }),
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "获取失败" });
  }
});

// ✅ 创建每日文案：所有登录用户都可以用
router.post("/daily", authMiddleware, async (req, res) => {
  try {
    let { songName, desc, bvid } = req.body;
    const extracted = extractBvid(bvid);
    if (extracted) bvid = extracted;

    if (!songName || !desc) {
      return res.status(400).json({ message: "歌曲名和文案不能为空" });
    }

    const item = await DailyCopy.create({
      songName,
      desc,
      bvid,
      userId: req.user.id,
      isChoiced: false,
    });

    res.json(item);
  } catch (err) {
    res.status(500).json({ message: "创建失败" });
  }
});

// ✅ 选定/取消选定：仅超管可用
router.put("/daily/:id/select", authMiddleware, async (req, res) => {
  try {
    // 只有超管组可以操作
    if (req.user.statusId !== 1) {
      return res.status(403).json({ message: "无权限，仅超管可选择" });
    }

    const { id } = req.params;
    const item = await DailyCopy.findByPk(id);
    if (!item) {
      return res.status(404).json({ message: "记录不存在" });
    }

    item.isChoiced = !item.isChoiced;
    await item.save();

    res.json({
      message: item.isChoiced ? "已选定" : "已取消选定",
      isChoiced: item.isChoiced,
    });
  } catch (err) {
    res.status(500).json({ message: "操作失败" });
  }
});

// ✅ 删除：仅超管可用
router.delete("/daily/:id", authMiddleware, async (req, res) => {
  try {
    // 只有超管组可以操作
    if (req.user.statusId !== 1) {
      return res.status(403).json({ message: "无权限，仅超管可删除" });
    }

    await DailyCopy.destroy({ where: { id: req.params.id } });
    res.json({ message: "删除成功" });
  } catch (err) {
    res.status(500).json({ message: "删除失败" });
  }
});

module.exports = router;
