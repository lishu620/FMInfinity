const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  isSuperAdmin,
  isIssueAdmin,
} = require("../middleware/auth");
const {
  sequelize,
  Issue,
  IssueAdmin,
  PublicSong,
  User,
  Vote,
  Copy,
} = require("../models");

// 获取所有稿件
router.get("/issue", authMiddleware, async (req, res) => {
  try {
    const issues = await Issue.findAll({ order: [["id", "DESC"]] });
    res.json(issues);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取失败" });
  }
});

// 创建新稿件
router.post("/issue", authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { title } = req.body;
    const issue = await Issue.create({ title });
    res.json(issue);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "创建失败" });
  }
});

// 所有人可见的稿件列表（仅展示已发布）
router.get("/issue/show-list", authMiddleware, async (req, res) => {
  try {
    const issues = await Issue.findAll({
      where: {
        status: "published", // 只返回已发布稿件
      },
      order: [["id", "DESC"]],
    });

    return res.json(issues);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "获取稿件失败" });
  }
});

// 获取可进入稿件查看的稿件列表
router.get("/issue/review-list", authMiddleware, async (req, res) => {
  try {
    if (req.user.Status.name !== "admin" && req.user.Status.name !== "文案组") {
      return res.status(403).json({ message: "无权限" });
    }

    const issues = await Issue.findAll({
      where: {
        status: ["confirmed"],
      },
      order: [["id", "DESC"]],
    });

    res.json(issues);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取稿件查看列表失败" });
  }
});

// 获取稿件详情(issue/:id)
router.get("/issue/:id", authMiddleware, async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await Issue.findByPk(issueId);

    if (!issue) {
      return res.status(404).json({ message: "稿件不存在" });
    }
    res.json(issue);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取稿件详情失败" });
  }
});

// 导入基础歌单
router.post(
  "/issue/:id/import-songs",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const issueId = req.params.id;
      const { songs } = req.body;

      if (!songs || !Array.isArray(songs) || songs.length === 0) {
        return res.status(400).json({ message: "歌单不能为空" });
      }

      const records = songs.map((item) => ({
        issueId,
        name: item.name || "",
        artist: "",
        submitter: item.submitter || "",
        link: "",
        isAdminInsert: true,
        isSelected: false,
      }));

      await PublicSong.bulkCreate(records);
      res.json({ message: "导入成功", count: songs.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "导入失败" });
    }
  },
);

// 获取本期歌曲（带歌姬）
router.get("/issue/:id/songs", authMiddleware, async (req, res) => {
  try {
    const issueId = req.params.id;
    const { Vsinger } = require("../models");

    const songs = await PublicSong.findAll({
      where: { issueId },
      order: [["id", "ASC"]],
      include: [
        { model: User, as: "selectedUser", attributes: ["id", "nickname"] },
        { model: Vsinger, as: "vsingers" },
      ],
    });

    res.json(songs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取歌曲失败" });
  }
});

router.get("/issue/:id/songs/vote-count", async (req, res) => {
  try {
    const issueId = req.params.id;
    const songs = await PublicSong.findAll({
      where: { issueId },
      include: [
        {
          model: Vote,
          attributes: [
            [sequelize.fn("COUNT", sequelize.col("Votes.id")), "voteCount"],
          ],
        },
      ],
      group: ["PublicSong.id"],
      order: [[sequelize.fn("COUNT", sequelize.col("Votes.id")), "DESC"]], // 排序
    });

    res.json(songs); // 返回按票数排序的歌曲
  } catch (err) {
    console.error("Error in /issue/:id/songs/vote-count:", err); // 打印详细错误日志
    res.status(500).json({ message: "获取歌曲失败", error: err.message });
  }
});

// 删除稿件（仅超级管理员）
router.delete("/issue/:id", authMiddleware, isSuperAdmin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const issue = await Issue.findByPk(id, { transaction: t });

    if (!issue) {
      await t.rollback();
      return res.status(404).json({ message: "稿件不存在" });
    }

    // 1. 先删除所有关联数据，避免外键报错
    await Copy.destroy({ where: { issueId: id }, transaction: t });
    await Vote.destroy({ where: { issueId: id }, transaction: t });
    await PublicSong.destroy({ where: { issueId: id }, transaction: t });
    await IssueAdmin.destroy({ where: { issueId: id }, transaction: t });

    // 2. 删除主稿件
    await issue.destroy({ transaction: t });

    await t.commit();
    res.json({ message: "稿件已删除" });
  } catch (err) {
    await t.rollback();
    console.error("删除稿件失败:", err);
    res.status(500).json({ message: "删除稿件失败" });
  }
});

// 获取本期管理员列表
router.get("/issue/:id/admins", authMiddleware, async (req, res) => {
  try {
    const admins = await IssueAdmin.findAll({
      where: { issueId: req.params.id },
      include: [{ model: User, attributes: ["id", "username", "nickname"] }],
    });
    res.json(admins.map((a) => a.User));
  } catch (err) {
    res.status(500).json({ message: "获取管理员失败" });
  }
});

// 添加本期管理员
router.post(
  "/issue/:id/admin",
  authMiddleware,
  isSuperAdmin,
  async (req, res) => {
    try {
      await IssueAdmin.create({
        issueId: req.params.id,
        userId: req.body.userId,
      });
      res.json({ message: "添加成功" });
    } catch (err) {
      res.status(500).json({ message: "添加管理员失败" });
    }
  },
);

// 移除管理员
router.delete(
  "/issue/:id/admin/:userId",
  authMiddleware,
  isSuperAdmin,
  async (req, res) => {
    try {
      await IssueAdmin.destroy({
        where: {
          issueId: req.params.id,
          userId: req.params.userId,
        },
      });
      res.json({ message: "移除成功" });
    } catch (err) {
      res.status(500).json({ message: "移除失败" });
    }
  },
);

// 添加歌曲
router.post(
  "/issue/:id/song",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const song = await PublicSong.create({
        issueId: req.params.id,
        name: req.body.name,
        artist: req.body.artist,
        submitter: req.body.submitter,
        link: req.body.link,
        isAdminInsert: true,
      });
      res.json(song);
    } catch (err) {
      res.status(500).json({ message: "添加歌曲失败" });
    }
  },
);

// 删除歌曲
router.delete(
  "/issue/:id/song/:songId",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      await PublicSong.destroy({ where: { id: req.params.songId } });
      res.json({ message: "删除成功" });
    } catch (err) {
      res.status(500).json({ message: "删除失败" });
    }
  },
);

// 更新稿件状态
router.put(
  "/issue/:id/status",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = [
        "draft",
        "submitting",
        "voting",
        "confirmed",
        "published",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "无效状态" });
      }

      await Issue.update({ status }, { where: { id } });
      res.json({ message: "状态更新成功" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "更新失败" });
    }
  },
);

// 编辑歌曲
router.put("/issue/:id/song/:songId", authMiddleware, async (req, res) => {
  try {
    const { id, songId } = req.params;
    const song = await PublicSong.findByPk(songId);

    if (!song) {
      return res.status(404).json({ message: "歌曲不存在" });
    }

    const isSuperAdmin = req.user.Status.name === "admin";
    const isCopyTeam = req.user.Status.name === "文案组";

    const issueAdmin = await IssueAdmin.findOne({
      where: { issueId: id, userId: req.user.id },
    });

    const isCurrentIssueAdmin = !!issueAdmin;

    let allowedFields = [];

    if (isSuperAdmin || isCurrentIssueAdmin) {
      allowedFields = [
        "name",
        "artist",
        "submitter",
        "link",
        "type",
        "isSelected",
        "copierNickname",
        "SelectedUser",
      ];
    } else if (isCopyTeam) {
      allowedFields = [
        "artist",
        "link",
        "type",
        "isSelected",
        "copierNickname",
        "SelectedUser",
      ];
    } else {
      return res.status(403).json({ message: "无权限修改" });
    }

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    await song.update(updates);

    // ==========================================
    // 🔥 核心：多选歌姬自动写入 SongVsinger 多对多表
    // ==========================================
    const { vsingerIds } = req.body;
    if (vsingerIds !== undefined) {
      await song.setVsingers(vsingerIds);
    }

    res.json({ message: "修改成功", song });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "修改失败" });
  }
});

router.put(
  "/issue/:id/selected-count",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const { count } = req.body;

      if (!Number.isInteger(count) || count < 1 || count > 10) {
        return res.status(400).json({ message: "选择数量必须是 1-10 的整数" });
      }

      const issue = await Issue.findByPk(req.params.id);
      if (!issue) return res.status(404).json({ message: "稿件不存在" });

      issue.selectedCount = count;
      await issue.save();

      res.json({ message: "设置成功", selectedCount: issue.selectedCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "设置失败" });
    }
  },
);

router.get("/issue/:id/review", authMiddleware, async (req, res) => {
  try {
    const issueId = req.params.id;

    if (req.user.Status.name !== "admin" && req.user.Status.name !== "文案组") {
      return res.status(403).json({ message: "无权限" });
    }

    const issue = await Issue.findByPk(issueId);
    if (!issue) return res.status(404).json({ message: "稿件不存在" });

    const songs = await PublicSong.findAll({
      where: { issueId, isReviewSelected: true },
      order: [["id", "ASC"]],
    });

    const votes = await Vote.findAll({ where: { issueId } });

    const voteMap = {};
    for (const v of votes) {
      voteMap[v.songId] = (voteMap[v.songId] || 0) + v.voteCount;
    }

    const copies = await Copy.findAll({
      where: { issueId },
      include: [{ model: User, attributes: ["id", "username", "nickname"] }],
    });

    const copyMap = {};
    for (const c of copies) {
      copyMap[c.songId] = c;
    }

    const result = songs.map((song) => ({
      ...song.toJSON(),
      totalVotes: voteMap[song.id] || 0,
      copy: copyMap[song.id]
        ? {
            id: copyMap[song.id].id,
            content: copyMap[song.id].content,
            isSubmitted: copyMap[song.id].isSubmitted,
            userId: copyMap[song.id].userId,
            nickname: copyMap[song.id].User?.nickname || "",
          }
        : null,
    }));

    res.json({
      issue,
      songs: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取稿件查看数据失败" });
  }
});

router.post(
  "/issue/:id/finalize-songs",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const issueId = req.params.id;
      const issue = await Issue.findByPk(issueId);

      if (!issue) return res.status(404).json({ message: "稿件不存在" });

      const songs = await PublicSong.findAll({
        where: { issueId },
      });

      const votes = await Vote.findAll({
        where: { issueId },
      });

      const voteMap = {};
      for (const v of votes) {
        voteMap[v.songId] = (voteMap[v.songId] || 0) + v.voteCount;
      }

      const rankedSongs = songs
        .map((song) => ({
          ...song.toJSON(),
          totalVotes: voteMap[song.id] || 0,
        }))
        .sort((a, b) => b.totalVotes - a.totalVotes || a.id - b.id);

      const selectedIds = rankedSongs
        .slice(0, issue.selectedCount)
        .map((song) => song.id);

      // 只更新文案池，不动投票池
      await PublicSong.update(
        { isReviewSelected: false }, // 先清空文案池
        { where: { issueId } },
      );

      await Copy.destroy({ where: { issueId } }); // 删除原来的文案

      if (selectedIds.length > 0) {
        // 只更新 isReviewSelected 字段，不动 isSelected
        await PublicSong.update(
          { isReviewSelected: true },
          { where: { id: selectedIds } },
        );
      }

      res.json({
        message: "已按票数自动选歌",
        selectedSongIds: selectedIds,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "自动选歌失败" });
    }
  },
);

// 单期稿件详情（所有人可见）
router.get("/issue/:id/show", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. 校验稿件是否存在
    const issue = await Issue.findByPk(id);
    if (!issue) return res.status(404).json({ message: "稿件不存在" });

    // 2. 单独查询所有相关数据，避免关联错误
    const songs = await PublicSong.findAll({
      where: { issueId: id, isReviewSelected: true },
      order: [["id", "ASC"]],
    });

    // 3. 单独查询票数
    const votes = await Vote.findAll({ where: { issueId: id } });
    const voteMap = {};
    votes.forEach((v) => {
      voteMap[v.songId] = (voteMap[v.songId] || 0) + v.voteCount;
    });

    // 4. 单独查询文案
    const copies = await Copy.findAll({
      where: { issueId: id },
      include: [{ model: User, attributes: ["id", "nickname"] }],
    });
    const copyMap = {};
    copies.forEach((c) => {
      copyMap[c.songId] = c;
    });

    // 5. 组装最终数据
    const result = songs.map((song) => ({
      ...song.toJSON(),
      totalVotes: voteMap[song.id] || 0,
      copy: copyMap[song.id]
        ? {
            ...copyMap[song.id].toJSON(),
            nickname: copyMap[song.id].User?.nickname || "未知",
          }
        : null,
    }));

    return res.json({ songs: result });
  } catch (err) {
    console.error("【/issue/:id/show 错误详情】", err);
    return res.status(500).json({ message: "加载失败", error: err.message });
  }
});

router.post("/issue/:id/copy/claim", authMiddleware, async (req, res) => {
  try {
    const issueId = req.params.id;
    const { songId } = req.body;

    if (req.user.Status.name !== "文案组") {
      return res.status(403).json({ message: "只有文案组可认领" });
    }

    const song = await PublicSong.findOne({
      where: { id: songId, issueId, isReviewSelected: true },
    });

    if (!song) {
      return res.status(404).json({ message: "歌曲不存在或未入选" });
    }

    const exist = await Copy.findOne({ where: { issueId, songId } });
    if (exist) {
      return res.status(400).json({ message: "该歌曲已被认领" });
    }

    const copy = await Copy.create({
      issueId,
      songId,
      userId: req.user.id,
      content: "",
      isSubmitted: false,
    });

    res.json({ message: "认领成功", copy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "认领失败" });
  }
});

router.put("/issue/:id/copy/:songId", authMiddleware, async (req, res) => {
  try {
    const { id: issueId, songId } = req.params;
    const { content, isSubmitted } = req.body;

    const copy = await Copy.findOne({
      where: { issueId, songId },
    });

    if (!copy) {
      return res.status(404).json({ message: "文案记录不存在" });
    }

    const isSuperAdmin = req.user.Status.name === "admin";
    const isOwner = copy.userId === req.user.id;

    if (!isSuperAdmin && !isOwner) {
      return res.status(403).json({ message: "无权限修改此文案" });
    }

    if (content !== undefined) copy.content = content;
    if (isSubmitted !== undefined) copy.isSubmitted = isSubmitted;

    await copy.save();
    res.json({ message: "保存成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "保存失败" });
  }
});

router.post(
  "/issue/:id/copy/assign",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const issueId = req.params.id;
      const { songId, userId } = req.body;

      const song = await PublicSong.findOne({
        where: { id: songId, issueId, isReviewSelected: true },
      });

      if (!song) {
        return res
          .status(404)
          .json({ message: "歌曲不存在或未进入稿件查看页" });
      }

      const targetUser = await User.findByPk(userId, {
        include: [{ model: require("../models").Status, attributes: ["name"] }],
      });

      if (!targetUser) {
        return res.status(404).json({ message: "指定用户不存在" });
      }

      let copy = await Copy.findOne({ where: { issueId, songId } });

      if (copy) {
        copy.userId = userId;
        await copy.save();
      } else {
        copy = await Copy.create({
          issueId,
          songId,
          userId,
          content: "",
          isSubmitted: false,
        });
      }

      res.json({ message: "指定成功", copy });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "指定失败" });
    }
  },
);

router.post(
  "/issue/:id/review-song",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const issueId = req.params.id;
      const { songId } = req.body;

      const song = await PublicSong.findOne({
        where: { id: songId, issueId },
      });

      if (!song) {
        return res.status(404).json({ message: "歌曲不存在" });
      }

      song.isReviewSelected = true;
      await song.save();

      res.json({ message: "已加入稿件查看页" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "加入失败" });
    }
  },
);

router.delete(
  "/issue/:id/review-song/:songId",
  authMiddleware,
  isIssueAdmin,
  async (req, res) => {
    try {
      const { id: issueId, songId } = req.params;

      const song = await PublicSong.findOne({
        where: { id: songId, issueId },
      });

      if (!song) {
        return res.status(404).json({ message: "歌曲不存在" });
      }

      song.isReviewSelected = false;
      await song.save();

      await Copy.destroy({ where: { issueId, songId } });

      res.json({ message: "已移出稿件查看页" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "移出失败" });
    }
  },
);

module.exports = router;
