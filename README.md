# no-game-no-life

life is a game, 为了帮助自己提高专注力, 所以创建了这个以游戏奖励机制为驱动的专注页面.

项目的本质是以番茄钟计时的方式记录个人的时间花费. 但是不同的是无论你是休息\运动\学习\工作\什么都不做, 你都会获得经验与金币, 记录生活做自己的事情, 购买想要的装备, 打败每周boss挑战, 实现自己的小目标, 记录自己的任务内容, 以更直观, 更有冲击的方式感受自己在变得更好.

## 环境要求

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Node.js | >= 18（推荐 20 LTS 及以上，开发验证环境为 v22.14.0） | Vite 5 的最低要求 |
| npm | >= 9（验证环境为 10.9.2） | 随 Node 附带 |
| 浏览器 | Chrome / Edge 最新版 | 需支持 IndexedDB、File System Access API |

> 项目无数据库、无后端服务依赖，所有游戏数据保存在浏览器 IndexedDB + 本地 `saves/` 目录，克隆后即可运行。

## 安装

```bash
# 1. 克隆仓库
git clone https://github.com/1203560562/no-game-no-life.git
cd no-game-no-life

# 2. 安装依赖
npm install
```

## 启动（开发模式 · 日常使用）

```bash
npm run dev
```

- 启动后访问 **http://localhost:5014**（端口固定为 5014，见 `vite.config.ts`）
- dev server 除静态页面外还提供两个本地接口：
  - `POST/GET /api/save-backup` —— 游戏存档的磁盘备份（写入项目根目录 `saves/latest.json`，每 30 分钟另存时间戳快照，保留最近 20 份）
  - `/glm-api/*` —— AI 智能记录的本地代理（如需此功能，在项目根目录创建 `.env.local` 并填入 API Key，该文件已被 .gitignore 忽略）
- **存档机制**：游戏存档为双源（服务器磁盘备份 `saves/latest.json` 优先，IndexedDB 兜底），因此**日常使用请保持 dev server 运行**，关掉 server 时仅剩浏览器本地存档

### Windows 开机自启（可选）

`scripts/autostart.ps1` 为静默启动脚本（隐藏窗口运行 `npm run dev`，并带端口占用检测防止重复启动）。已通过「启动文件夹快捷方式」实现开机自启：

1. `Win + R` 输入 `shell:startup` 打开启动文件夹
2. 新建快捷方式，目标填写：

   ```
   powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\tmp\TraeCode\LevelUP\scripts\autostart.ps1"
   ```

3. 重启后自动拉起 dev server；若安全软件（火绒等）弹窗询问启动项，选择允许

撤销自启动：删除启动文件夹里的 `LevelUP-dev.lnk` 即可。

## 构建与生产预览（非日常）

```bash
npm run build     # 产物输出到 dist/
npm run preview   # 本地预览构建产物
```

> 注意：`npm run preview` 不含 `/api/save-backup` 存档接口，生产模式下磁盘备份不可用，仅作构建验证用途，日常游玩请使用 `npm run dev`。

## 常用排查

- **存档疑似丢失**：先确认 dev server 是否在运行（`http://localhost:5014/api/save-backup` 能否返回 JSON），再查看 `saves/` 目录与 `scripts/autostart.log`（自启日志）
- **5014 端口被占用**：脚本会自动检测并跳过启动，结束占用进程后重试
- **类型检查**：`npx tsc --noEmit`
