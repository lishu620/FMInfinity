const { Sequelize, DataTypes } = require("sequelize");
const path = require("path");

// 连接SQLite数据库
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(__dirname, "../main.sqlite"),
  logging: false,
});

// 1. 用户组表 (status)
const Status = sequelize.define("Status", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true }, // 组名：如"文案组"
  description: { type: DataTypes.TEXT },
});

// 2. 用户表
const User = sequelize.define("User", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING, allowNull: false, unique: true }, // 账号
  password: { type: DataTypes.STRING, allowNull: false }, // 加密密码
  nickname: { type: DataTypes.STRING, allowNull: false }, // 昵称
  isGroupAdmin: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否本组管理员
  statusId: { type: DataTypes.INTEGER, allowNull: false }, // 所属组ID
  isApproved: { type: DataTypes.BOOLEAN, defaultValue: false },
  isBanned: { type: DataTypes.BOOLEAN, defaultValue: false },
});

// 3. 稿件表 (每期)
const Issue = sequelize.define("Issue", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false }, // 本期标题：如"2026年4月推荐"
  status: {
    type: DataTypes.ENUM(
      "draft",
      "submitting",
      "voting",
      "confirmed",
      "published",
    ),
    defaultValue: "draft",
    allowNull: false,
  }, // 稿件状态
  selectedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    validate: { min: 1, max: 10 },
  }, // 本期最终选歌数量
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

// 4. 稿件管理员表 (指定本期管理员)
const IssueAdmin = sequelize.define("IssueAdmin", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issueId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
});

// 5. 公共提交歌曲表
const PublicSong = sequelize.define("PublicSong", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issueId: { type: DataTypes.INTEGER, allowNull: false }, // 所属稿件ID
  name: { type: DataTypes.STRING, allowNull: false }, // 歌曲名
  link: { type: DataTypes.STRING }, // 网易云/B站链接（可选）
  type: { type: DataTypes.STRING }, // 歌曲类型（可选）
  submitter: { type: DataTypes.STRING }, // 提交者昵称（可选）

  isSelected: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否进入初选结果
  isReviewSelected: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否进入稿件查看页/需要写文案

  SelectedUser: { type: DataTypes.INTEGER }, // 文案组选歌时的选择人
  isAdminInsert: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否管理员直接插入
});

// 6. 投票表
const Vote = sequelize.define("Vote", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issueId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  songId: { type: DataTypes.INTEGER, allowNull: false },
  voteCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 0, max: 3 },
  }, // 0-3票
});

// 7. 文案表
const Copy = sequelize.define("Copy", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  issueId: { type: DataTypes.INTEGER, allowNull: false },
  songId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false }, // 文案作者
  content: { type: DataTypes.TEXT, allowNull: false }, // 文案内容
  isSubmitted: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否提交
});

// 8. 歌姬表
const Vsinger = sequelize.define("Vsinger", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  vsingerName: { type: DataTypes.TEXT, allowNull: false },
});

// 表关联
User.belongsTo(Status, { foreignKey: "statusId" });
Status.hasMany(User, { foreignKey: "statusId" });

Issue.hasMany(PublicSong, { foreignKey: "issueId" });
PublicSong.belongsTo(Issue, { foreignKey: "issueId" });

Issue.hasMany(IssueAdmin, { foreignKey: "issueId" });
IssueAdmin.belongsTo(Issue, { foreignKey: "issueId" });
IssueAdmin.belongsTo(User, { foreignKey: "userId" });

Issue.hasMany(Vote, { foreignKey: "issueId" });
Vote.belongsTo(Issue, { foreignKey: "issueId" });
Vote.belongsTo(User, { foreignKey: "userId" });
Vote.belongsTo(PublicSong, { foreignKey: "songId" });

Issue.hasMany(Copy, { foreignKey: "issueId" });
Copy.belongsTo(Issue, { foreignKey: "issueId" });
Copy.belongsTo(PublicSong, { foreignKey: "songId" });
Copy.belongsTo(User, { foreignKey: "userId" });

Issue.hasMany(Vote, { foreignKey: "issueId" });
Vote.belongsTo(Issue, { foreignKey: "issueId" });

User.hasMany(Vote, { foreignKey: "userId" });
Vote.belongsTo(User, { foreignKey: "userId" });

PublicSong.hasMany(Vote, { foreignKey: "songId" });
Vote.belongsTo(PublicSong, { foreignKey: "songId" });

PublicSong.belongsTo(User, {
  foreignKey: "SelectedUser",
  as: "selectedUser",
});

// 歌姬--歌曲
const SongVsinger = sequelize.define("SongVsinger", {}, { timestamps: true });

PublicSong.belongsToMany(Vsinger, {
  through: SongVsinger,
  foreignKey: "songId",
  otherKey: "vsingerId",
  as: "vsingers",
});
Vsinger.belongsToMany(PublicSong, {
  through: SongVsinger,
  foreignKey: "vsingerId",
  otherKey: "songId",
  as: "publicSongs",
});

// 初始化数据库并创建默认超管
const initDB = async () => {
  await sequelize.sync({ force: false });

  // 创建默认超级管理员组
  const [adminGroup] = await Status.findOrCreate({
    where: { name: "admin" },
    defaults: { description: "超级管理员组" },
  });

  // 创建默认文案组
  const [copyGroup] = await Status.findOrCreate({
    where: { name: "文案组" },
    defaults: { description: "文案编辑组" },
  });

  // 创建默认超管用户 admin / admin@123
  const bcrypt = require("bcryptjs");
  const hashedPwd = await bcrypt.hash("admin@123", 10);
  await User.findOrCreate({
    where: { username: "admin" },
    defaults: {
      nickname: "超级管理员",
      password: hashedPwd,
      statusId: adminGroup.id,
      isGroupAdmin: true,
    },
  });

  console.log("数据库初始化完成");
};

initDB();

module.exports = {
  sequelize,
  User,
  Status,
  Issue,
  IssueAdmin,
  PublicSong,
  Vote,
  Copy,
  Vsinger,
};
