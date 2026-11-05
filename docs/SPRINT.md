# 2026-11-05 冲刺

基线：`doc/development_spec.md`（v1.2-react-stack）。仓库里没有 `docs/development-spec.md`。本文件只排今日可执行任务，不重写 PRD。

目标是一台 Windows 电脑上可离线主持的单屏「你画我猜」：导入题库、2–12 队轮流公开作答、权威倒计时、全场题目只首次分配一次、撤销和耗尽语义正确、结束后能保存并查看历史。动画放在业务事务测试通过之后。

本轮只建立执行规则和模块边界。下面 S01 之后的任务都还没开始。

## 现状

脚手架是 electron-vite + React 19 + TypeScript，包管理器是 npm，锁文件是 `package-lock.json`。

| 项 | 当前值 |
|---|---|
| Electron | 44.10.2（Node 24.22.2，`NODE_MODULE_VERSION` 149，Chrome 152） |
| electron-builder | 26.18.0 |
| React | 19.3.1，放在 `devDependencies`，由 Vite 打包 |
| 业务依赖 | 未安装。没有 Router、Zustand、Zod、Tailwind、shadcn/ui、SQLite、ExcelJS、Papa Parse，也没有倒计时、动效和音效库 |
| 能运行的行为 | 模板窗口、`window.electron.ipcRenderer.send('ping')`、版本号展示 |
| 安全缺口 | `sandbox: false`；Preload 暴露了整份 `electronAPI`；Renderer 直接读 `window.electron.process` |

`npm run typecheck` 已通过。这只说明模板能编译，不代表比赛闭环存在。

## 模块边界

```text
Renderer ── window.gameAPI（白名单 DTO）──► Preload ── ipcMain.handle ──► Main
                                                                      │
                                                                      ▼
                                                              SQLite / 文件
Main ── 事务提交后的 GameSnapshot / GameUiEvent ──► Renderer
```

- **Main**（`src/main`）：窗口生命周期、安全策略、文件对话框、SQLite、迁移、`GameEngine`、`TimerEngine`、`QuestionEngine`、`ScoreEngine`、`RecoveryService`、ExcelJS、Papa Parse、导出和备份。游戏事实只写在这里。
- **Preload**（`src/preload`）：只挂 `window.gameAPI`。每个方法对应一个具名通道，参数和返回值用 `src/shared` 的 Zod 类型。`subscribe` 返回取消函数。
- **Renderer**（`src/renderer`）：P01–P10、shadcn/ui、品牌 Token、Zustand 草稿、快捷键、圆环和音效。路由从 `GameState` + `TurnState` 推导，不另存一份页面事实。
- **Shared**（`src/shared`）：枚举、DTO、schema、常量。不依赖 Electron、React 或 SQLite。

Renderer 不得 import `better-sqlite3`、`fs`、`electron`。Preload 不得打开数据库。圆环 `onComplete`、Confetti、CountUp 都不得写回分数。

## Windows 打包与依赖风险

当前 `electron-builder.yml` 还不能交付规格要求的 Windows 包。

| 风险 | 证据 | 处理 |
|---|---|---|
| 正式包不能在这台 Mac 上封板 | 规格要求 Windows 环境构建并在 Windows 11 x64 实机验收。本机是 darwin | Mac 只改配置和跑逻辑测试。`Setup.exe` 的通过结论留到 Windows |
| 默认只出 NSIS | electron-builder 26.18.0 的 `winPackager.defaultTarget` 是 `["nsis"]`。`build:win` 没有 `--x64`，也没有 portable | 改为 `electron-builder --win nsis portable --x64`，产物名固定为 x64 |
| 原生模块不会按目标平台重编 | `npmRebuild: false`。`postinstall` 的 `install-app-deps` 只面对本机 Electron | Windows 构建机上为 Electron ABI 149 重建 `better-sqlite3` |
| `.node` 会被打进 asar | `asarUnpack` 只有 `resources/**` | 增加 `better-sqlite3` 的原生文件解包 |
| 没有现成的 Electron 149 Windows 预编译包 | `better-sqlite3@13.0.3` 的常规资源地址 `...electron-v149-win32-x64.tar.gz` 返回 HTTP 404 | 不要假设 `npm install` 后就能在 Windows 加载。构建机需要 VS C++ 工具链，或先确认真实存在的预编译文件名 |
| 自动更新配置还在 | `publish.provider: generic`，地址是 `https://example.com/auto-updates` | 发布配置去掉该段，避免安装包带更新地址 |
| 未签名 | 仓库没有证书 | SmartScreen 和企业白名单可能拦截。这是发布条件，不改变玩法 |
| Excel / CSV | ExcelJS、Papa Parse 是纯 JavaScript | 只在 Main 解析，限制文件大小、行数和解压膨胀。不要安装 npm 包 `xlsx` |
| 动效库 | 计划中的 React 库可由 Vite 打进 Renderer | 不进入 Main，不拥有计时和分数 |

数据库文件放在 `userData/data/draw-and-guess.db`。Portable 版也不承诺和 exe 同目录。

## 今日任务

完成定义都指向规格里的对应规则。P1 不在本表。

| ID | 任务 | 完成定义 |
|---|---|---|
| S01 | 收紧窗口和 IPC 边界 | `sandbox/contextIsolation/nodeIntegration` 符合规则；Renderer 不再出现 `ipcRenderer` 或 `window.electron`；`gameAPI` 类型挂到 `window` |
| S02 | 建立 `src/shared` 契约 | 今日闭环用到的枚举、快照、命令和 Zod schema 可被 Main 与 Renderer 同时引用 |
| S03 | SQLite 迁移 | 规格 §8 的表、枚举和全部唯一索引落地，包括每场仅一道 `CURRENT` 的部分唯一索引；开启外键和 WAL；库文件位于 `userData` |
| S04 | 题库导入、模板、导出 | `.xlsx`/`.csv` 导入有成功、重复、失败行号；模板可下载；当前题库可导出后再导入 |
| S05 | 创建比赛 | 2–12 队、1–5 轮、时长和计分规则校验后一次写完队伍、全部挑战和题目快照队列；0 题不能创建 |
| S06 | 权威计时 | Main 用单调时钟和截止时刻计算 `remainingMs`；暂停不扣时；恢复后继续；每秒检查点，关键操作立即落盘 |
| S07 | 开始、答对、跳过 | 同一事务完成判定、计分、切题和指针更新；重复 `commandId` 不二次计分；剩余时间不重置 |
| S08 | 撤销 | 符合规格 §2.5：下一题 `VOIDED` 不回池，上一题恢复为唯一 `CURRENT`，分数抵销，时间不回退 |
| S09 | 耗尽与终态 | 无新题时 `TURN_EXHAUSTED` + 未开始挑战 `TURN_NOT_PLAYED` + `GAME_FINISHED_EARLY`；零秒优先于耗尽；全部正常结束才是 `GAME_FINISHED` |
| S10 | 换队与结算 | 结算页不自动开表；主持人确认后才进入下一队 `TURN_READY`；提前结束不显示冠军，也不提供下一队入口 |
| S11 | 异常恢复 | 按规格 §7.2 恢复。`TURN_RUNNING` 重启后为 `TURN_PAUSED` 并重展同一题；两个 `CURRENT` 进入 `RECOVERY_REQUIRED` |
| S12 | 历史 | 已结束和未结束比赛可按日期查看；详情含队伍、逐题、作废题和终态；重启后仍在 |
| S13 | 成绩导出与库备份 | 成绩工作簿含总览、排行、逐题、修正、题目使用、挑战排程；备份可恢复，且恢复后不自动开表 |
| S14 | 人工修分 | 仅终态或已结算挑战可修；记录旧值、新值、原因；排名和导出同时变化；终态不变 |
| S15 | 页面闭环 | P01、P02、P03、P04、P05、P06、P07、P08/P09 读取 Main 快照。准备页不展示未分配题目 |
| S16 | 大屏可读性 | 1080p 下题目、倒计时、当前队和操作按钮可见；2–12 队分数都能看到；圆环只展示 Main 剩余时间 |
| S17 | 快捷键与退出 | `Space` 暂停、`Enter` 答对、`→` 跳过、`Ctrl+Z` 撤销；输入框和暂停态不误触发；关窗先确认并暂停 |
| S18 | 品牌 Token | 深色大屏使用规格 §5.2 的可替换变量；无获批 Logo 时用文字 `DRAW & GUESS`；中文可读 |
| S19 | 一致性测试 | Vitest 覆盖首次分配去重、零秒拒答、撤销作废、耗尽提前结束、恢复暂停。不把圆环回调当结算 |
| S20 | Windows 打包配置 | yml 改为 x64 NSIS + Portable，解包原生模块，去掉 example 更新地址；文档写明必须在 Windows 重编 ABI 149 |
| S21 | 动效和音效 | 只消费已提交 `eventId`。静音、减少动态效果、素材缺失时，判题和计时仍正确。无许可素材不用 CDN |
| S22 | 本机闭环烟测 | 开发窗口完成一场 4 队导入、作答、暂停、撤销、结束、重启查看历史。Mac 烟测不等于 Windows 发布通过 |

S04–S14 是数据闭环。S15–S18 只展示 Main 已经提交的状态。S21 在 S19 通过后才做。

## 今日不做

- 账号、云同步、手机端、画板、AI 判题、第二主持人窗口、自动更新。
- 赛中补题、跨历史去重、加赛、历史图表、归档、浅色主题。
- 在 macOS 上把交叉编译的 exe 标成 Windows 11 发布通过。
- 把 `doc/development_spec.md` 拆成另一份需求文档。

## 建议的下一次实现顺序

先做 S01–S03，再做 S05–S11 和 S19。页面可以先用文字和按钮把闭环跑通，再补 S16 的投影尺寸和 S21 的动画。Windows 构建机准备 VS C++ 工具链，按 Electron 44 / ABI 149 验证 `better-sqlite3` 能在打包后的 exe 里打开数据库。
