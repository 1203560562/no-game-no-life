# BOSS 周挑战 + 回顾系统 + 里程碑增强 设计文档

日期：2026-08-28
状态：设计已与用户确认

## 背景与目标

核心循环（记录→成长→收集→抽奖→外观）已完备，但玩法全部是"积累型"：数值只涨、金币只花在外观与消耗品，缺少**消耗成长数值的对抗性玩法**与**看见历史的长线回顾**。本次新增两个模块：

1. **BOSS 周挑战**：把每局专注产出转化为对周 BOSS 的伤害，击杀掉金币与稀有装备
2. **回顾系统**：GitHub 贡献图风格的年度热力图 + 成长回顾卡 + 里程碑回顾墙

---

## 一、BOSS 周挑战

### 核心循环

每周一（ISO 周）刷新一届 BOSS → 番茄钟/开局的每局结算 XP 转化为伤害 → 击杀领取金币+稀有掉落 → 未击杀不惩罚，归档战报 → 下周更强的一届登场（编年史爬塔）。

### 伤害链路（数据驱动，无手动操作）

- `endSession` 结算时：`damage = session.xpGained`（复用效率引擎，等级/属性/技能成长直接转化为战斗力）
- BOSS 血量：`hp = max(0, hp - damage)`，同时 `totalDamage += damage`
- 击杀判定：`hp === 0` 时置 `killedAt`，触发全屏击杀 Overlay + 掉落展示
- 手动记录行动**不**造成伤害（伤害仅来源于局计时，用户已确认）

### 周刷新（惰性）

- `weekKey` 采用 ISO 周（`YYYY-Www`，周一为一周起点）
- 在 `init` 与 `update` 时检查：当前时间 ISO 周 ≠ `bossState.weekKey` → 归档本届到 `history`（`killed` 真值记录胜/败），生成新一届（`stage + 1`），重置伤害/HP
- 未击杀归档为「战败」，无任何惩罚

### 数值设计

- HP 递增公式：`HP(1) = 600`，`HP(n) = round(600 × 1.6^(n-1))` 封顶 20000
  - 参考产能：2 局/天 × 25min ≈ 400~500 XP/天；第 1 届约 1.5~2 天可杀
- 击杀金币：`150 + stage × 50`
- 稀有掉落：击杀必掉 1 件紫档以上背景/服饰，复用宝箱奖池 `LOOT_CATS`（与宝箱保底计数相互独立，互不干扰）
- 掉落领取：击杀即入 `unlockedItems`（重复道具按现有 50% 金币折算规则），在击杀 Overlay 中展示

### 数据结构（`src/types/index.ts` 新增）

```ts
/** BOSS 周挑战状态（AppState.bossState） */
export interface BossState {
  weekKey: string        // ISO 周 'YYYY-Www'
  bossId: string         // bossConfig BOSS_ROSTER 条目 id
  stage: number          // 第几届（从 1 递增）
  hp: number             // 当前剩余 HP
  maxHp: number          // 本届总 HP
  totalDamage: number    // 本周累计伤害
  killedAt?: string      // 击杀时间（ISO）
  rewardClaimed?: boolean // 击杀掉落是否已入账（幂等标记）
  history: BossRecord[]  // 历届战报（新的在前）
}

export interface BossRecord {
  weekKey: string
  bossId: string
  stage: number
  totalDamage: number
  killed: boolean
  rewardClaimed?: boolean
}
```

`AppState` 新增可选字段 `bossState?: BossState`（旧存档兼容：缺省时在 init 迁移中创建第 1 届）。

### BOSS 配置（`src/config/bossConfig.ts` 新增）

```ts
export interface BossDef {
  id: string
  name: string        // 「深渊巨龙·瓦罗斯」
  title: string       // 称号「沉睡千年的灾厄」
  element: string     // 主题色 key（配色/特效）
  portrait: string    // public/bosses/<id>.png
  taunt: string       // 开场威慑台词
}
```

- 预定义 10 届图鉴（名字/称号/主题色/台词），`stage` 超过 10 后循环复用（数值继续增长）
- 立绘：AI 生成动漫厚涂风 PNG，存 `public/bosses/`，预生成前 8 届；尺寸约 1024×1024，深色背景融入页面（页面用暗色渐变底框包裹）

### UI

- **`BossPage`（新路由 `/boss`）**
  - 顶部：BOSS 立绘（动漫厚涂）+ 名字/称号/台词 + 大血条（带伤害动画）+ 届数徽章
  - 中部：本周战况（累计伤害/贡献局列表：每局标题→伤害值/倒计时至周一）
  - 底部：编年史（历届 BOSS 缩略 + 胜/败 + 当届伤害），「🏆 讨伐成功 N 连」激励
- **Dashboard 卡片**：紧凑血条 + 本周伤害 + 距周末倒计时，点击跳 `/boss`
- **击杀 Overlay**（`BossVictoryOverlay`，加入 FeedbackOverlay 家族）：全屏爆发（84 粒金紫粒子 + 号角 + flash），展示金币与掉落道具卡片，需手动关闭；仪式感对齐里程碑完成
- 伤害入账时首页卡片血条做 shake/red 闪烁反馈

### 引擎与状态接入

- 新建 `src/engine/bossEngine.ts`：`isoWeekKey(date)`、`createBossState(stage)`、`applyBossDamage(state, xpGained)`、`rolloverBossIfNeeded(state)`（周刷新+归档）、`bossKillRewards(stage)`（金币+掉落计算）
- `activityEngine.endSession` 链路末尾调用 `applyBossDamage`；击杀时发放奖励并入 `unlockedItems`、触发 `pendingBossEvents`（store 队列，模式对齐 `pendingMilestoneEvents`）
- `useGameStore.init` 中做旧档迁移（无 bossState → 创建第 1 届）
- 主题套装加成等现有加成继续通过 XP 间接放大伤害，不单独叠加

---

## 二、回顾系统（报告页扩展）

`ReportsPage` 顶部新增「🎮 冒险回顾」区块，三个模块：

### 1. 年度热力图（`components/HeatmapCalendar.tsx` 新增）

- GitHub 贡献图同款：近 53 周 × 7 天网格（列=周，行=周一~周日），每格 = 当日 XP
- 五档配色：0 → slate-800，>0 按 XP 分位加深（teal 200→600，与现有 rpg-xp 色系一致）
- 数据源 `dailyXpLog`（已有，无新数据采集）
- 悬停 tooltip：日期 + 当日 XP + 局数（从 sessions 聚合）
- 底部图例：Less → More
- 纯 CSS Grid 实现（53 列横向滚动，移动端可滚动）

### 2. 成长回顾卡

- **加入游戏第 X 天**：`player.createdAt` → 今天
- **Lv 成长曲线**：遍历 `activities`（按 createdAt 排序）累计 XP，用 `requiredXP(level)` 推算每次升级的时间点，在 ECharts 时间轴上打点连线（真实可推导，非编造）
- **属性雷达图**：当前七维（复用现有 EChart 雷达实现，如无则新增）
- **累计战绩**：总 XP / 完成局数 / 成就数 / 最长连续记录天数 / 减重里程（weightGoal 数据）

### 3. 里程碑回顾墙

- 数据源：`milestones` 中 `finalClaimed === true` 的条目
- 奖杯墙布局：目标名 + 档位徽章（🥉🥈🥇👑）+ 完成日期
- 时间口径：`MilestoneReward` 新增 `doneAt?: string`，`syncMilestones` 置 `done=true` 时写入；旧存档已完成但无 `doneAt` 的显示「—」
- 空状态：引导去里程碑页创建目标

---

## 三、里程碑系统增强（用户设计输入 v2）

对现有里程碑系统（time 型 + 三入口关联 + 目标只增不减）的 4 项增强：

### 3.1 单次投入限制（防刷 / 防爆量）

- `MilestoneReward` 新增可选字段 `limits?: { minPerSession?: number; maxPerSession?: number }`（单位：分钟）
- 语义（用户已确认）：
  - **minPerSession**：单次实际投入 **低于下限时本次完全不计入**该里程碑进度（防开小局刷进度）
  - **maxPerSession**：单次实际投入**高于上限时封顶计入**上限值（防单次爆量冲目标）
- 作用范围：仅 time 型里程碑；对番茄钟结算与手动记录关联同样生效
- 创建表单：两个可选数字输入（"单次至少 __ 分钟才计入 / 单次最多计入 __ 分钟"），留空 = 不限制
- 结算反馈：局结算/记录反馈中提示实际计入情况（如「目标A +25min（达下限）」「目标B 未达单次下限，未计入」）

### 3.2 多里程碑关联

- 一局/一次记录可关联**多个** time 型里程碑，数量不设上限（用户已确认），各自独立累计进度，各自应用自己的单次限制
- 数据结构变更：
  - `usePomodoroStore`：`milestoneId: string | null` → `milestoneIds: string[]`（持久化读入时兼容旧单值：`data.milestoneId ? [data.milestoneId] : ...`）
  - `ActivityInput`（store/types.ts）：`milestoneId?: string` → `milestoneIds?: string[]`，所有调用点同步更新
  - `addLinkedMinutes(milestones, id, minutes)` → `addLinkedMinutes(milestones, ids: string[], minutes: number)`：对每个 id 应用 3.1 的 clamp 规则后累计
- UI 三入口（今日冒险 SessionHero / 番茄钟面板 PomodoroTimer / 记录行动 ActivityLogger）：关联标签条从单选改为**多选 toggle**（点选加入、再点移除），已选金色高亮，不限个数

### 3.3 目标时长可调开关

- `MilestoneReward` 新增 `durationLocked?: boolean`（缺省 false = 可调整，与现状一致）
- 创建表单：新增开关「允许后续调整目标时长」（默认开）
- MilestonesPage 的「⏱ 调整目标时长（只增不减）」按钮仅在 `!durationLocked && !finalClaimed` 时显示；锁定后按钮隐藏并显示 🔒 标记

### 3.4 对自己的话 + 奖励区块

- `MilestoneReward` 新增 `messageToSelf?: string`（创建时填写的寄语）
- 与现有 `reward`（奖励承诺）**分开存储、同区块呈现**（用户已确认）：
  - 创建表单：「✉️ 给自己的话」区块 = 奖励承诺输入 + 寄语 textarea
  - 里程碑卡片：寄语以引用样式展示在进度条下方
  - 完成仪式（MilestoneOverlay final 态）：展示寄语 + 奖励承诺（达成时刻看到自己当初的话）
  - 回顾墙奖杯：悬停/展开显示寄语与奖励

---

## 四、错误处理与兼容

- `bossState` 全字段可选（旧档迁移幂等：init 检测缺失才创建）
- 击杀奖励发放幂等：`rewardClaimed` 标记 + StrictMode 双调用防重入（复用 initPromise 模式）
- 周刷新时钟依赖客户端本地时间（与现有签到/每日结算同口径）
- 热力图/回顾卡纯只读派生，无状态副作用
- 里程碑增强字段（limits/durationLocked/messageToSelf）全部可选，旧存档缺省语义 = 现状行为（可调时长、无限制、无寄语）
- 番茄钟持久化旧 `milestoneId` 单值读入时折叠为 `[id]`；`ActivityInput` 为内存接口直接改字段并更新全部调用点，不留旧字段

## 五、测试策略

按用户默认验证深度（代码 + 编译 + API 级验证）：

- `tsc --noEmit` 类型检查 + `npm run build` 生产构建通过
- dev 环境用 store API 直接注入局结算，验证：伤害入账、HP 扣减、击杀触发、奖励入账与幂等、跨周归档刷新
- 回顾模块注入伪造 dailyXpLog/activities 验证渲染分档与升级曲线计算
- 里程碑增强：多关联结算（一次 addActivity 关联 2 个目标各自累计）、min/max 限制边界（低于下限不计入 / 高于上限封顶）、durationLocked 隐藏调整入口、旧持久化 milestoneId 单值兼容读取
