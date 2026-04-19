const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { Issue, PublicSong, Vote, User, Vsinger } = require("../models");

// 获取【所有投票中】的稿件列表
router.get("/vote/issues", authMiddleware, async (req, res) => {
  try {
    const issues = await Issue.findAll({
      where: { status: "voting" },
      order: [["id", "DESC"]],
    });
    res.json(issues);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取投票稿件失败" });
  }
});

// 获取单个稿件的【所有可投票歌曲】
router.get("/vote/issue/:id/songs", authMiddleware, async (req, res) => {
  try {
    const songs = await PublicSong.findAll({
      where: {
        issueId: req.params.id,
        isSelected: true,
      },
      include: [
        {
          model: Vote,
          attributes: ["id", "userId", "voteCount"],
          include: [
            {
              model: User,
              attributes: ["id", "nickname"],
            },
          ],
        },
        {
          model: Vsinger,
          as: "vsingers",
          attributes: ["id", "vsingerName"],
        },
      ],
      order: [["id", "ASC"]],
    });

    const result = songs.map((song) => {
      const json = song.toJSON();

      return {
        ...json,
        voterDetails: (json.Votes || []).map((vote) => ({
          userId: vote.userId,
          nickname: vote.User?.nickname || "未知用户",
          voteCount: vote.voteCount || 0,
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取投票歌曲失败" });
  }
});

router.get("/issue/:id/show-list", authMiddleware, async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await Issue.findByPk(issueId);

    if (!issue || issue.status !== "published") {
      return res.status(403).json({ message: "无权限查看该稿件" });
    }

    const songs = await PublicSong.findAll({
      where: { issueId, isReviewSelected: true }, // 只显示已选入文案池的歌曲
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

    // 只展示有文案的歌曲
    const result = songs
      .map((song) => ({
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
      }))
      .filter((song) => song.copy); // 过滤出已完成文案的歌曲

    res.json({
      issue,
      songs: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "获取文案数据失败" });
  }
});

// 重置投票
router.post("/vote/issue/:id/reset", authMiddleware, async (req, res) => {
  try {
    const { songId } = req.body;
    const issueId = req.params.id;
    const userId = req.user.id;

    await Vote.destroy({
      where: {
        issueId,
        songId,
        userId,
      },
    });

    res.json({ message: "已重置本人投票" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "重置投票失败" });
  }
});

// ====================== 【修复 1】返回数组，不是对象 ======================
router.get("/vote/issue/:id/my-vote", authMiddleware, async (req, res) => {
  try {
    const votes = await Vote.findAll({
      where: {
        issueId: req.params.id,
        userId: req.user.id,
      },
    });
    res.json(votes); // 返回数组
  } catch (err) {
    res.status(500).json({ message: "获取我的投票失败" });
  }
});

// 提交投票
router.post("/vote/issue/:id/submit", authMiddleware, async (req, res) => {
  try {
    const { songId, voteCount = 1 } = req.body;
    const issueId = req.params.id;
    const userId = req.user.id;
    const user = req.user;

    const isCopyTeam = user.group === "文案组";
    let maxVote = isCopyTeam ? 1 : 3;

    if (voteCount < 1 || voteCount > maxVote) {
      return res.status(400).json({ message: `最多可投 ${maxVote} 票` });
    }

    // 先删除这首歌的旧投票
    await Vote.destroy({
      where: { issueId, userId, songId },
    });

    // 提交这首歌的投票
    await Vote.create({
      issueId,
      userId,
      songId,
      voteCount,
    });

    res.json({ message: "投票成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "投票失败" });
  }
});

// 获取投票结果
router.get("/vote/issue/:id/result", authMiddleware, async (req, res) => {
  try {
    const votes = await Vote.findAll({
      where: { issueId: req.params.id },
    });

    const countMap = {};
    votes.forEach((v) => {
      countMap[v.songId] = (countMap[v.songId] || 0) + v.voteCount;
    });

    res.json(countMap);
  } catch (err) {
    res.status(500).json({ message: "获取投票结果失败" });
  }
});

module.exports = router;
