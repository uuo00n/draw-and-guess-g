# 你画我猜

Genpact Dalian Digital 团建用的单机桌面程序。主持人用一台电脑把画面投到大屏，题目公开，各组轮流作答。程序完全离线，比赛、题库和历史都写在本机 SQLite。

当前版本 **1.1.0**。正式支持与发布门禁是 **Windows 11 x64**；Windows 10 x64 尽力兼容。macOS 与 Windows 都可以开发和打包，Windows 安装包必须在 Windows x64 上构建并实机验收。

这是内部团建工具，不是 Genpact 对外产品。

## 现在能做什么

| 页面 | 路径 | 作用 |
|---|---|---|
| 首页 | `/` | 进入创建、分组、题库、历史和设置；可继续未结束的比赛 |
| 比赛分组 | `/grouping` | 只读查看当前分组和规则 |
| 题库 | `/questions` | 导入 `.xlsx` / `.csv`，维护题目 |
| 创建比赛 | `/setup` | 用当前分组冻结一场比赛，设置挑战时长 |
| 比赛大屏 | `/session/:gameId` | 准备、计时、答对、跳过、撤销、结算 |
| 历史 | `/history` | 查看已结束和进行中的比赛，导出成绩 |
| 设置 | `/settings` | 音效、动效、全屏、替换分组、备份、恢复、清空历史 |

当前比赛规则：

- 队伍来自当前分组 JSON，默认 8 组，队名是「第 N 组」。创建时冻结顺序、颜色和到场成员。赛中不能改组或重排。
- 轮数固定为 1。单次挑战 30–300 秒，默认 60 秒。答对 +1，跳过不加分。答对或跳过立刻换题，本组剩余时间不重置。
- 任意时刻只有一组在计时。下一组要在准备页手动开始。
- 同一规范化题目在一场里只首次分配一次。没有未使用题目时，本场提前结束，不授冠军。
- `Ctrl+Z` 只撤销本挑战最近一次尚未被后续判定覆盖的答对或跳过。计时不回退。
- 分数、计时和抽题以主进程为准。圆环、撒花和音效只做展示。

## 技术栈

Electron + electron-vite + React 19 + TypeScript。路由用 React Router，界面草稿用 Zustand。样式是 Tailwind CSS 4 和 shadcn/ui。SQLite 用 `better-sqlite3`，Excel 用 ExcelJS，CSV 用 Papa Parse，校验用 Zod。包管理器是 npm，锁文件是 `package-lock.json`。

运行时 Electron **44.10.2**（内置 Node 24.22.2，`NODE_MODULE_VERSION` 149）。构建机使用 Node.js 22。

```text
Renderer ── window.gameAPI ──► Preload ──► Main ──► SQLite
Main ── 事务提交后的快照 ──► Renderer
```

渲染进程不直接改分、抽题或访问数据库。窗口开启 `contextIsolation` 和 `sandbox`，关闭 `nodeIntegration`。

## 开发

在仓库根目录：

```bash
npm ci
npm run dev
```

`postinstall` 会安装 Electron，并按 Electron ABI 重建 `better-sqlite3`。

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发窗口 |
| `npm run typecheck` | 检查主进程与渲染进程类型 |
| `npm test` | 运行 Vitest |
| `npm run test:e2e` | 跑一场 Electron 比赛流程 |
| `npm run lint` | ESLint |
| `npm start` | 预览已构建的程序 |

## 打包

步骤、产物文件名、签名和验收见 [doc/packaging.md](doc/packaging.md)。

```bash
# Windows x64，必须在 Windows 上执行
npm run build:win

# macOS，必须在 macOS 上执行
npm run build:mac
```

Windows 产物：

- `dist/你画我猜-1.1.0-win-x64-Setup.exe`
- `dist/你画我猜-1.1.0-win-x64-Portable.exe`

macOS 产物：

- `dist/draw-and-guess-1.1.0.dmg`
- 同版本的 zip

在 macOS 上交叉打出的 Windows 包不能当作发布通过。安装包未签名：Windows 可能被 SmartScreen 拦截，macOS 未公证。持续集成工作流是 `.github/workflows/windows-build.yml`。

`package.json` 里还有 `build:linux`，当前发布不包含 Linux。

## 数据

数据库在 Electron `userData/data/draw-and-guess.db`，不跟安装目录或 Portable exe 放在一起。

| 系统 | 通常路径 |
|---|---|
| Windows | `%APPDATA%\你画我猜\data\draw-and-guess.db` |
| macOS | `~/Library/Application Support/你画我猜/data/draw-and-guess.db` |

设置页可以备份、恢复、打开数据目录，以及清空全部历史。清空不会删除题库、当前分组 JSON 和磁盘上已有的备份文件。

## 文档

| 文件 | 内容 |
|---|---|
| [doc/development_spec.md](doc/development_spec.md) | 开发基线（v1.2-react-stack） |
| [doc/add_specv1.1.md](doc/add_specv1.1.md) | 固定分组、分组页、创建确认、清空历史 |
| [doc/packaging.md](doc/packaging.md) | Windows 与 macOS 打包 |
