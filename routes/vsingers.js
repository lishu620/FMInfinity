const express = require("express");
const router = express.Router();
const { authMiddleware, isSuperAdmin } = require("../middleware/auth");
const { Vsinger } = require("../models");

// 获取所有歌姬（带歌曲数量）
router.get("/vsingers", authMiddleware, async (req, res) => {
  try {
    const {
      Vsinger,
      SongVsinger,
      PublicSong,
      sequelize,
    } = require("../models");

    const list = await Vsinger.findAll({
      order: [["id", "ASC"]],
      include: [
        {
          model: PublicSong,
          as: "publicSongs",
          attributes: [],
          required: false,
        },
      ],
      attributes: {
        include: [
          [sequelize.fn("COUNT", sequelize.col("publicSongs.id")), "songCount"],
        ],
      },
      group: ["Vsinger.id"],
    });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取歌姬失败" });
  }
});

// 新增歌姬（仅超管）
router.post("/vsingers", authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { vsingerName } = req.body;
    if (!vsingerName)
      return res.status(400).json({ message: "歌姬名不能为空" });

    const item = await Vsinger.create({ vsingerName });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "创建失败" });
  }
});

// 编辑歌姬（仅超管）
router.put("/vsingers/:id", authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { vsingerName } = req.body;
    if (!vsingerName)
      return res.status(400).json({ message: "歌姬名不能为空" });

    await Vsinger.update({ vsingerName }, { where: { id: req.params.id } });
    res.json({ message: "更新成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "更新失败" });
  }
});

// 删除歌姬（仅超管）
router.delete(
  "/vsingers/:id",
  authMiddleware,
  isSuperAdmin,
  async (req, res) => {
    try {
      await Vsinger.destroy({ where: { id: req.params.id } });
      res.json({ message: "删除成功" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "删除失败" });
    }
  },
);

// 批量导入歌姬
router.post(
  "/vsingers/batch-import",
  authMiddleware,
  isSuperAdmin,
  async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ message: "导入文本不能为空" });

      // 按 、 分割 + 去空格 + 去空项
      const names = text
        .split("、")
        .map((item) => item.trim())
        .filter(Boolean);

      if (names.length === 0)
        return res.status(400).json({ message: "未识别到有效歌姬" });

      // 批量创建（自动跳过重复）
      const result = [];
      for (const name of names) {
        const [vsinger, created] = await Vsinger.findOrCreate({
          where: { vsingerName: name },
          defaults: { vsingerName: name },
        });
        if (created) result.push(vsinger);
      }

      res.json({
        message: `导入成功！新增 ${result.length} 个歌姬`,
        count: result.length,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "批量导入失败" });
    }
  },
);

// ==========================================
// 1. 获取歌姬被选歌曲总数
// ==========================================
router.get("/vsingers/:id/song-count", authMiddleware, async (req, res) => {
  try {
    const { Vsinger } = require("../models");
    const vsinger = await Vsinger.findByPk(req.params.id);
    if (!vsinger) return res.status(404).json({ message: "不存在" });

    const count = await vsinger.countPublicSongs();
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "错误" });
  }
});

// ==========================================
// 2. 获取该歌姬参与的所有歌曲（带Issue信息）
// ==========================================
router.get("/vsingers/:id/songs", authMiddleware, async (req, res) => {
  try {
    const { Vsinger, PublicSong, Issue } = require("../models");
    const vsinger = await Vsinger.findByPk(req.params.id);
    if (!vsinger) return res.status(404).json({ message: "不存在" });

    const songs = await vsinger.getPublicSongs({
      include: [{ model: Issue, attributes: ["id", "title", "status"] }],
      order: [["id", "DESC"]],
    });

    res.json(songs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取失败" });
  }
});

module.exports = router;
