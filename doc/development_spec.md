# Genpact-draw&guess 桌面程序

> **产品需求说明书（PRD）+ UI/UX 设计规范 + 技术架构 + 数据库设计 + 开发任务与验收标准**  
> 文档版本：`v1.2-react-stack`（基于 v1.1 业务规则；React 技术栈与本地素材方案修订版）  
> 编写日期：`2026-11-05`  
> 目标平台：**Windows 11 x64（正式支持与发布门禁）；Windows 10 x64（尽力兼容，不作为 V1 发布阻断项）**  
> 开发环境：macOS / Windows 均可开发；**Windows 正式安装包必须在 Windows 环境构建并实机验收**  
> 交付形态：**Electron 单体桌面应用，支持完全离线使用，包含本地数据库**  
> 产品名 **Genpact-draw&guess**（内部团建工具，非 Genpact 官方产品）

---

## 0. 执行摘要与已确定决策

本项目是一款面向公司团建主持人的**单屏、公开出题、多队轮流挑战**桌面应用。主持人在 Windows 电脑上运行程序，将游戏画面投影到会议室大屏；选手根据公开题目作画并竞猜，主持人用鼠标或键盘判定答对、跳过，程序自动计时、抽取下一题、累计得分并保存全过程。

### 0.1 不允许被后续开发改动的核心规则

1. **单屏模式**：只需一台 Windows 电脑和一个连接的投影/电视；不建设主持人专用第二窗口。
2. **题目公开**：当前题目直接在大屏中央显示，不使用“隐藏答案/保密揭题”流程。现场可安排猜题者背对屏幕、画手面向屏幕。
3. **队伍轮流**：任意时刻最多只有一个队伍在挑战，其他队伍处于等待/已完成状态；**不会同时计时**。
4. **手动配置队伍数**：赛前可通过数字输入框、`−/+` 按钮设置 `2–12` 队，动态配置队名、颜色与挑战顺序；默认 4 队。
5. **每队独立挑战**：默认每队每轮 60 秒；答对或跳过立即切换下一道题，**本队剩余时间不重置**。
6. **本地全局去重**：同一标准化题目分配成功后会记为已用，跨比赛去重。撤销和暂停恢复保留该记录，清空比赛历史会重置用题记录，也可以在没有未结束比赛时从设置单独重置。
7. **下一队手动启动**：上一队倒计时归零时先结算并停留在准备页，主持人确认后才开始下一队。
8. **Excel 本地导入**：支持 `.xlsx` 和 `.csv`，无需联网、无需服务器。
9. **本地历史记录**：保存比赛、回合、队伍、每题判定、作废题目、计分修正及结果状态；支持查询、导出、备份、恢复。
10. **Genpact 视觉风格**：优先遵循公司**当前获批准品牌素材**；如无法取得内部最新 Design System，使用本文的“公开品牌资料参考版”，并把色值做成可替换 Token。
11. **Electron Windows 交付**：最终交付 `Setup.exe` 安装版和可选 `Portable.exe`；无网络环境可运行。
12. **React 技术实现**：Electron + React 19 + TypeScript + React Router + Zustand + Tailwind CSS 4 + shadcn/ui；不再使用 Vue / Pinia / Vue Router。
13. **投影视觉与音效**：圆环倒计时、得分滚动、切题过场、撒花和冠军 Lottie 动画与本地音效均支持静音/降低动画/性能降级；**效果不影响主进程权威状态**。

### 0.2 冻结决策与实施约束

- **创建比赛即冻结题目池快照**：队伍、轮次、顺序、计分规则、题目来源及随机队列此后不可变。赛中追加/重排/重建队列不属于 V1，独立列入 P1 后续规划；单纯维护全局题库不会改变已经创建的比赛。
- **题目耗尽=全场提前结束**：只要当前挑战因无题可抽而进入 `TURN_EXHAUSTED`，整场即记 `GAME_FINISHED_EARLY`（即使恰好是赛程最后一场）；若最后一题是在计时归零时以 `TIMEOUT` 结束，且所有计划挑战都正常结束，则记 `GAME_FINISHED`。提前结束只展示“当前积分榜/未完成时长或赛程”，不授予正式冠军称号。
- **两层状态机**：`GameState` 表示整场比赛生命周期；`TurnState` 表示单次挑战；归档为 `archived_at` 属性而非运行状态。
- **撤销后新题不回池**：撤销前已分配的下一题变为 `VOIDED` 并继续占用；恢复上一题时必须确保同场只有一题处于 `CURRENT`。
- **成绩可审计**：历史事件只追加，所有分数修正需记录目标、修改前后分数、操作者标识（本机主持人）与原因，并重新计算排行榜和导出结果。
- **发布门禁**：Windows 11 x64 必须实机验收；Windows 10 仅尽力兼容；官方品牌素材仍需内部批准，不因规则定稿而免验。

### 0.3 V1 边界

**包含**：本地单机、题库导入、动态队伍、轮次、公开题目、全局去重、倒计时、计分、结算、历史、备份、Windows 打包，以及本地打包的倒计时圆环、必要庆祝动画和音效。

**不包含**：账号登录、云端同步、联网多人、AI 自动猜题/绘图识别、在线画板、手机投屏端、自动更新服务、远程数据库。

> **术语**：一“场比赛”（Game）由若干“轮”（Round）组成；一轮中每支队伍各进行一次“挑战”（Turn）；每次挑战可以连续处理多道“题目”（Question）。例如 5 队 × 3 轮 = **15 次独立挑战**，不是 15 道题。

---

## 1. 用户、现场与成功标准

### 1.1 角色

| 角色 | 权限/行为 | 是否需要账号 |
|---|---|---|
| 主持人/操作员 | 配题库、设队伍、控制计时、判定答题、查看记录、导出 | 否 |
| 当前挑战队 | 依次参加挑战 | 否 |
| 其他队与观众 | 观看大屏和比分 | 否 |

### 1.2 现场设备及使用前提

- Windows 电脑一台；显示器镜像到会议室电视/投影（推荐 1920×1080、16:9）。
- 鼠标与键盘可用；可选连接音箱。
- 程序可无管理员权限运行（便携版或按用户安装的安装版）。
- 不依赖外网、公司 Wi-Fi、API Key 或浏览器扩展。
- 因题目直接公开显示，**猜题人员应不看大屏**；这是游戏主持规则，而非软件的权限隔离能力。

### 1.3 成功标准

- 一名主持人可在 2 分钟内完成导入、配置并开始比赛（不含制作 Excel）。
- 现场可连续完成 `2–12 队 × 1–5 轮`，中途无需重启程序。
- 同一份本地数据库中相同标准化题目零重复分配；倒计时结束后零次越界加分。
- 重启/异常退出后，可恢复未结束比赛；RUNNING 挑战**以暂停状态恢复**，READY/结算页按原流程恢复，不凭空继续计时。
- 完整导出比分与答题明细，并可独立备份数据库。

---

## 2. 游戏机制与产品规则

### 2.1 默认配置

| 参数 | 默认值 | V1 支持范围/行为 |
|---|---:|---|
| 队伍数量 | 4 | 2–12，数字输入和步进按钮 |
| 队伍名称 | 第 1 队…第 4 队 | 可编辑，不能为空，比赛内不重复 |
| 队伍颜色 | 自动分配 12 种区分色 | 可从受控色板选取，避免同色难区分 |
| 轮数 | 3 | 1–5 轮，未来可扩展 |
| 单次挑战 | 60 秒 | 30–300 秒，步进 5/10 秒或预置值 |
| 答对积分 | +1 | V1 默认统一 1 分，可在赛前选择“题目自带分值” |
| 跳过 | +0 | 直接切题；原题视为已用 |
| 抽题 | 洗牌后顺序消费 | 全场唯一，且受选中题库及分类过滤 |
| 队伍顺序 | 按配置顺序轮流 | 赛前支持上下移动调整顺序 |
| 回合切换 | 手动确认 | 永远不会自动开始下一队倒计时 |
| 计时结束 | 自动锁定当前挑战 | 当前展示题记为 `TIMEOUT`，进入结算 |
| 题库耗尽 | 当前挑战 `TURN_EXHAUSTED` 且整场 `GAME_FINISHED_EARLY` | 不允许自动重复，后续未开始挑战标记 `TURN_NOT_PLAYED / POOL_EXHAUSTED` |

### 2.2 比赛顺序示例（5 队、3 轮）

- 第 1 轮：A → B → C → D → E。
- 第 2 轮：A → B → C → D → E。
- 第 3 轮：A → B → C → D → E。
- 每次挑战有自己的 60 秒计时器；**B 队的开始不依赖 A 队结束时的剩余时间**。
- 所有已完成挑战的得分累计，最后按总分降序排名；同分并列，不强制平局决胜。
- V1 可提供“额外加赛”作为 **P1**：并列时新增加赛挑战，仍受全局去重约束。

### 2.3 答题流程

1. `READY`：显示即将挑战的队伍、轮次、规则和“开始挑战”。
2. 主持人按开始：锁定当前队伍，取出全场唯一题目，**题目直接显示在大屏**，开始倒计时。
3. 点击/按 `Enter` 答对：当前题提交 `correct`、加分、记录事件、取下一道题；倒计时继续。
4. 点击/按 `→` 跳过：当前题提交 `skipped`、不加分、记录事件、取下一道题；倒计时继续。
5. 点击/按 `Space` 暂停：屏幕隐藏当前题并禁用答对和跳过。继续时作废原题，以剩余时间换一道新题。
6. 时间到 0：当前未判定题记录 `timeout`，锁定操作并写入回合结果。
7. 若本队计时正常结束，进入单队结算页；若新题不足，则按第 2.4 节立刻走题库耗尽分支。
8. 正常结束且还有待挑战队伍时，主持人点击“下一队”后才进入其 `TURN_READY`，**不自动开始**；全部挑战完成进入 `GAME_FINISHED` 排行榜。
9. 题库提前耗尽时直接进入 `GAME_FINISHED_EARLY` 结果页，剩余未开始挑战不得继续启动。

### 2.4 题目去重：必须定义清楚的语义

**去重作用域与强制不变量**：

- 选中的题库与分类在 `games.create` 时排除已用词并生成持久化洗牌队列。预排队列只保存快照，首次分配才占用题目。
- `used_questions` 以 `normalized_text` 为主键。抽题在同一个事务内记录用词与更新队列，并再次排除已用词。
- 首次分配成功后即标记为已使用：`CURRENT` / `JUDGED` / `VOIDED` 都计入；`UNUSED` 才允许分配。`correct`、`skipped`、`timeout`、崩溃恢复或撤销作废都不能重新释放给其他队伍。
- 清空比赛历史时在同一事务内删除比赛和用词记录。恢复备份时合并本地与备份的用题记录。只有备份缺少用题表时，才从备份中的历史题目推导已出题记录。
- 题库全局编辑只更新库记录；**当前比赛仍按创建时的快照显示与计分**，不能刷新、追加、重排或重建题目队列；比赛进行中不开放题库编辑入口。
- 规范化规则：Unicode `NFKC`、`trim()`、合并连续空白、统一英文大小写；同义词（手机/移动电话）不在自动去重范围内。

**耗尽的确定规则**：

1. 创建比赛前，筛选后的可用题数为 `0`，**禁止创建比赛**，提示补充新词或调整题库、分类。已有比赛进入挑战时若无可用题，按题池耗尽结算。
2. 开始或继续挑战、判题后尝试分配下一题时，若没有尚未使用的 `UNUSED` 题，不再展示新题、不自动复用旧题；当前挑战判定成功后清空当前题指针并进入 `TURN_EXHAUSTED`，原因 `POOL_EXHAUSTED`。若在上一题已经到时则优先按 `timeout` 正常结束该挑战。
3. 若当前挑战进入 `TURN_EXHAUSTED`，将所有尚未开始的 `TURN_PENDING` / `TURN_READY` 标记 `TURN_NOT_PLAYED`，原因 `POOL_EXHAUSTED`；**整场一律进入 `GAME_FINISHED_EARLY`**。只有当前挑战按时间归零进入 `TURN_FINISHED`，且所有计划挑战均 `TURN_FINISHED` 时，整场才进入 `GAME_FINISHED`。
4. 结果页展示已进行挑战成绩、已使用题数、各队**完成次数**及提前结束原因，并显示“当前积分榜（比赛提前结束）”；提前结束不授予正式冠军。同分仍并列。
5. 历史与 Excel 导出必须含 `game_status`、`end_reason`、计划/实际完成挑战次数、`TURN_NOT_PLAYED` 项及被作废的题；不允许将未比赛轮次按 0 分误算为正常完成。
6. V1 不支持赛中补题后继续；若需要新题，必须结束当前比赛并**新建比赛**。新比赛仍排除历场已用词。

**同一时刻判断优先级**：Main 进程收到操作先核对权威截止时刻：若 `remainingMs <= 0`，先执行 `timeout`；否则接受 `correct/skipped`，再判断是否耗尽。此规则也用于“最后一题答对恰逢 0 秒”的竞态测试。

### 2.5 误操作、撤销与编辑

- 每道题仅能有一个**当前有效**判定；历史判定与撤销以不可变事件保存，UI 不能凭连续双击重复计分。
- `Ctrl+Z` 可在 `TURN_RUNNING`（剩余时间 >0）或 `TURN_PAUSED` 使用，但仅允许撤销**本挑战最近一次 `correct/skipped` 且其后没有其他题的有效判定**；不支持撤销 `timeout`、已结算/耗尽挑战或更早事件。这些情况走人工成绩修正。
- **撤销事务必须原子地完成**。为最近判定的题 Q1 写入 `UNDO` 事件，抵销积分及跳过次数，清除有效判定并标为 `VOIDED`。当前题 Q2 及其指针保持，计时不回退。
- 如果 `Q1` 判定已经造成 `TURN_EXHAUSTED` / `TURN_FINISHED`，不允许再撤销；可在已结束比赛上进行有理由的人工成绩修正，保留原判定日志。
- 启动后以暂停状态恢复时隐藏原题。继续时作废原题，从队列中分配一道未使用的题。数据库保证同场最多一道 `CURRENT` 题，发现异常时进入 `RECOVERY_REQUIRED`。
- 人工修正允许针对某次挑战（更新该挑战分与总分），或针对队伍整体额外加减（只更新队伍总分）；需给出原因、修正前后值和审计事件，且不直接改写 `answer_events`。见第 8.3 节。

---

## 3. 功能需求清单（带优先级与验收规则）

### 3.1 题库模块

| ID | 功能 | 优先级 | 验收要点 |
|---|---|---|---|
| Q-01 | 导入 `.xlsx` | P0 | 文件选择导入，解析第一张工作表或选择 Sheet |
| Q-02 | 导入 `.csv` | P0 | 正确处理 UTF-8 BOM；非 UTF-8 提示编码或选择编码重试 |
| Q-03 | 字段映射和默认值 | P0 | `题目` 必填，`分类/难度/分值` 可选；自动映射常见列名 |
| Q-04 | 空行/重复/非法字段校验 | P0 | 显示总行数、成功数、跳过数、逐行错误 |
| Q-05 | 题库预览、搜索、分类过滤 | P0 | 可查题、禁用题、删除错误题 |
| Q-06 | 下载 Excel 模板 | P0 | 模板含示例、字段说明、有效值规则 |
| Q-07 | 多题库管理 | P0 | 题库可命名、启用/禁用；历史不因题库删除而丢失 |
| Q-08 | 题库容量检查 | P0 | 单文件建议 ≤5 MB、有效题 ≤2,000；超限给友好提示 |
| Q-09 | 赛前可用题数预估 | P0 | 根据筛选与已用记录报告剩余数量并给出不足警告 |
| Q-10 | **赛中题库冻结** | **P0** | 比赛创建后禁止追加、重排或改变当前比赛题目来源；新的题库需创建新比赛。未来赛中追加另列 P1 独立设计 |
| Q-11 | 导出当前题库 | **P0** | 将指定题库导出 `.xlsx`，内容、启停状态、来源信息可回读；与成绩导出不同 |

### 3.2 队伍与比赛配置

| ID | 功能 | 优先级 | 验收要点 |
|---|---|---|---|
| T-01 | **手动配置队伍数量** | **P0** | `2–12` 可输入、步进控制；数量变化自动增加/减少配置项 |
| T-02 | 队伍名称与颜色 | P0 | 名称非空、同场不重复；颜色可辨识 |
| T-03 | 队伍排序 | P0 | 拖拽或上下移动改变挑战顺序 |
| T-04 | 增减队伍时保护输入 | P0 | 减少队数先缓存被隐藏项；未保存时恢复数量可找回编辑内容 |
| T-05 | 轮数、倒计时、得分规则 | P0 | 校验取值范围；配置立即更新赛事预览 |
| T-06 | 配置预览 | P0 | 显示“队伍数 × 轮数 = 挑战场次”，例：5 × 3 = 15 |
| T-07 | 赛中修改限制 | P0 | **创建比赛时**即锁定队伍数、顺序、轮次、时长、积分规则与题目池快照；更改须新建比赛 |
| T-08 | 比赛名称 | P1 | 例如“2026 Digital 团建”；支持可选备注 |

### 3.3 游戏大屏与倒计时

| ID | 功能 | 优先级 | 验收要点 |
|---|---|---|---|
| G-01 | 公开展示当前题目 | P0 | 中央字号足够大；长题自动缩放/换行，无截断 |
| G-02 | 当前挑战队高亮 | P0 | 顶部显示当前队、轮次、实时得分 |
| G-03 | 精确计时 | P0 | 采用单调时间基准+截至时刻计算，不依赖简单减 1 定时器 |
| G-04 | 开始/暂停/恢复 | P0 | 暂停不计时；重复触发不生成错误状态 |
| G-05 | 答对和跳过 | P0 | 原子记录判定+积分+切题；当前时间不会重置 |
| G-06 | 时间到零保护 | P0 | 0 秒后无法继续加分；声音/画面只触发一次 |
| G-07 | 全局不重复抽题 | P0 | 跨比赛、题库、队伍和轮次无重复分配；撤销和恢复均不重显已用题 |
| G-08 | 下一队准备页 | P0 | 必须显式点“开始挑战”，不能自动开倒计时 |
| G-09 | 全屏/窗口切换 | P0 | 投影下展示正常，退全屏不清空状态 |
| G-10 | 快捷键 | P0 | `Space` 暂停、`Enter` 答对、`→` 跳过、`Ctrl+Z` 撤销 |
| G-11 | 最后 10 秒音效 | P0 | 可一键静音，倒计时结束音不重复；使用本地资源与 `use-sound` |
| G-14 | **圆环倒计时视图** | **P0** | `react-countdown-circle-timer` 只渲染状态与进度；Main 进程裁决剩余时间/零秒 |
| G-15 | **答对反馈与冠军庆祝** | **P0** | 答对使用轻量 `canvas-confetti`；仅正式完成且存在唯一冠军时允许冠军烟花/奖杯 Lottie，提前结束不授冠 |
| G-16 | **投影动效与减弱动画** | **P0** | `motion` 完成切题/结算过场；`react-countup` 完成比分跳变，均可禁用或自动降级 |
| G-12 | 退出保护 | P0 | 进行中关窗二次确认并安全暂停，不能静默丢失比赛 |
| G-13 | 主持人手动结束本队挑战 | P1 | 确认后记 `EARLY_END`，有详细日志 |

### 3.4 结算、成绩与历史

| ID | 功能 | 优先级 | 验收要点 |
|---|---|---|---|
| H-01 | 单次挑战结算 | P0 | 显示答对数、跳过数、超时题、该次得分 |
| H-02 | 比赛实时排行榜 | P0 | 任意队伍数动态呈现；同分并列 |
| H-03 | 最终排行榜 | P0 | 显示所有队伍、名次、总分及完成轮次；`FINISHED_EARLY` 标明部分赛程、不得宣布冠军 |
| H-04 | 游戏历史列表 | P0 | 按日期倒序，支持关键词、状态过滤 |
| H-05 | 游戏详情 | P0 | 轮次、队伍、逐题内容、结果、时间、累计分 |
| H-06 | 未完成比赛恢复 | P0 | READY/结算按原页面恢复；RUNNING 转 PAUSED；原已 PAUSED 保持；不继续隐式倒计时 |
| H-07 | 成绩导出 | P0 | `.xlsx`，至少含赛事总表、队伍分数、逐题明细 |
| H-08 | 题库导出与数据库备份 | P0 | 题库导出调用 `exportBank`，备份调用 `backupDatabase`；选择路径、可校验且可回读 |
| H-09 | 人工成绩修正记录 | P0 | 可定位到具体 `turn_id`（或全队额外分）；旧值、新值、备注、时间留痕；同步重算排行榜与导出 |
| H-10 | 历史对比图表 | P1 | 按队伍/比赛统计正确率、题目分类表现 |
| H-11 | 记录归档与恢复 | P1 | 历史归档不影响本场去重记录 |

### 3.5 软件设置

- 默认计时、音量（总音量/音效静音）、全屏偏好、快捷键说明、效果强度 `off / low / normal`、系统降低动态效果偏好（P0）。
- 数据目录打开、数据库备份/恢复、清理策略、版本号、日志导出（P0）。
- UI 显示尺寸自适应、动画减少模式、音效无法播放时可视化提示、系统缩放兼容（P0）。
- 主题切换（品牌深色 / 品牌浅色）可在 P1 实现，V1 优先品牌深色大屏。

---

## 4. 页面清单、UI 信息架构与交互

### 4.1 页面地图

```text
启动/恢复检查
  └── P01 首页 / 最近比赛
        ├── P02 题库管理
        │     ├── D01 导入与列映射
        │     └── D02 导入结果/错误明细
        ├── P03 新建比赛 / 队伍配置
        ├── P04 挑战准备（READY）
        │     └── P05 游戏大屏（RUNNING/PAUSED）
        │           ├── D03 暂停与结束确认
        │           └── P06 当前队结算
        │                 ├── 返回 P04 下一队
        │                 └── P07 最终排行榜
        ├── P08 历史比赛列表
        │     └── P09 历史详情 / 导出
        └── P10 应用设置 / 备份 / 恢复
```

### 4.2 P01 首页

- 首屏文案：`Genpact-draw&guess`，副标题“Team Challenge”。
- 主操作按钮：“创建新比赛”。
- 次操作：“继续未完成比赛”“题库管理”“历史记录”“设置”。
- 底部显示有效题目总数、最近一场比赛、软件版本。
- 右上角放置**经过公司批准的 Genpact Logo**；无可用素材时用纯文字暂代。

### 4.3 P02 题库管理

- 顶部：题库名称切换、导入、**导出当前题库**、下载模板、清空筛选。
- 统计卡：题库数量、题目总数、有效题目、重复题/禁用题。
- 表格：`题目 | 分类 | 难度 | 分值 | 来源题库 | 状态 | 操作`。
- 导入结果弹窗：成功/重复/空行/非法分值及行号；支持仅导入通过校验的记录。
- 保存“原始文件名、导入时间、文件哈希、导入结果”，以便回溯来源。

### 4.4 P03 新建比赛 / 多队配置（重点）

- 比赛名称（可选，默认以日期生成）。
- **队伍数配置器**：`[-] [ 5 ] [+]`，允许键盘编辑，范围 2–12。
- 下方立即渲染 5 个编辑框：队伍 1–5 的名称、颜色、顺序调整手柄。
- 轮次选择（1–5）、挑战时长（30–300 秒）、积分规则。
- 题库和分类过滤，显示未出过的题目数量。
- 配置预览：队伍 `5` × 轮数 `3` = **15 次挑战**；估算题目需求与可用数量。
- 点击“创建并进入准备页”时：校验配置及**可用题数至少 1**、冻结赛事规则、**保存题目文本/属性快照**、生成固定队列与全部挑战排程、写入数据库。
- **队伍数由 `teams.length` 唯一派生**，不在数据库存储与其矛盾的独立人数值。

### 4.5 P04 挑战准备

- 标题：`ROUND 02 / 03`；大字突出“下一位：第 3 队”。
- 显示当前队的累计分、本轮挑战时长、上一队简短成绩。
- 主按钮：“开始 60 秒挑战”。
- 次按钮：“查看排行榜”“退出并暂停整场”。
- **准备页不展示新的题目内容**，避免尚未开始就消耗/暴露题目。

### 4.6 P05 游戏大屏（最重要）

**1920×1080 大屏布局建议**：

```text
┌───────────────────────────────────────────────────────────────┐
│ [Approved Genpact Logo]    Genpact-draw&guess         第 2 / 3 轮   │
├───────────────────────────────────────────────────────────────┤
│ [队伍A  7分] [队伍B  5分] [★ 队伍C  8分] [队伍D  6分] ... │
├───────────────────────────────────────────────────────────────┤
│                  当前挑战：队伍 C                              │
│                                                                 │
│                         画 蛇 添 足                            │
│                                                                 │
│                     [成语]   [中等]   第 05 题                 │
│                                                                 │
│                         00 : 38                                │
│                ━━━━━━━━━━━━━━━━━━━──────                     │
├───────────────────────────────────────────────────────────────┤
│       [ 暂停 Space ]    [ 答对 +1 Enter ]     [ 跳过 → ]      │
│  本队答对 4    跳过 1                      下一队：队伍 D      │
└───────────────────────────────────────────────────────────────┘
```

**大屏硬约束**：

- 中央题目字号：1080p 默认约 `72–112px`，根据字数自适应；不能使用小字号固定截断。
- 倒计时字号：默认 `92–128px`，数字等宽，保持视觉稳定。
- 队伍 2–4：顶部完整比分卡；5–8：紧凑卡；9–12：顶部当前队及前三名，其他队进入可展开的排名带/侧栏；不裁剪队伍数据。
- 颜色只用于辅助识别；队伍名称和名次必须始终以文本展示。
- 30 秒前主色中性/白；最后 10 秒采用 Gold/Coral 强提示；倒计时 0 秒出现 `TIME UP`。
- 题目不能因动画导致读不清；`motion` 切题转场约 150–250ms，并在新题展示前保持上题不可操作；最后 3 秒只让数字轻微脉冲。
- `react-countdown-circle-timer` 圆环显示在题目下方，与大数字同步，色阶遵循品牌 Token，不能将组件自身 `onComplete` 作为结束挑战的业务命令。
- `react-countup` 对比分做短暂滚动，真实积分仍以 Main 快照为准；动画进行中不得短暂写入数据库错误值。
- 所有操作按钮可以鼠标点击，也有对应键盘快捷键。

### 4.7 P06 单队结算

- 显示“本次挑战结束”、当前队名称、本次得分、累计总分、答对/跳过数量。
- 明确下一队：`下一位：队伍 D`；主按钮“下一队准备”。
- 最后一支队伍完成最后一轮时改为“查看最终结果”；如果本轮因题目池耗尽且还有赛程，则直接显示提前结束结果，不展示下一队启动入口。
- 本页面不启动计时、不自动抽题；发生 `POOL_EXHAUSTED` 时不能再出现“下一队准备”，直接进入提前结束结果页。

### 4.8 P07 最终排行榜 / 提前结束结果

- 12 队以内完整名次卡或表格；冠亚季军可放大展示。使用 `motion` 揭榜、`react-countup` 滚动积分、`lottie-react` 播放本地奖杯动画，唯一冠军时可使用 `canvas-confetti` 撒花。
- 同分展示“并列第 N 名”，不伪造唯一冠军；若 `GAME_FINISHED_EARLY`，标题改为“比赛提前结束 · 当前积分榜”，不颁发冠军。
- 展示赛事名称、开始/结束时间、轮次数、总答对题数、总跳过题数。
- 操作：查看详情、导出 Excel、返回首页、基于配置新开一局（**新比赛的题库去重重新计算**）。

### 4.9 P08/P09 历史记录与详情

- 列表字段：赛事名称、日期、状态、队伍数、轮数、题目消耗、冠军/并列、总分。
- 详情支持：轮次切换、队伍筛选、逐题事件流、修改记录、导出。
- 状态：**比赛状态** `READY/ACTIVE/FINISHED/FINISHED_EARLY/ABORTED`；`PAUSED` 是**挑战状态**，在列表中作为派生标签展示；`ARCHIVED`（P1）是 `archived_at` 非空的归档标签；表单“草稿”仅保留于前端，不持久化为比赛。
- 重开时发现未结束比赛，按 **7.2 的恢复矩阵**回到准备页/暂停游戏页/单队结算页；原 `RUNNING` 一律转为 `PAUSED`，其他状态不强行改成暂停。

### 4.10 P10 设置 / 数据管理

- 全屏、音量、音效、默认时长、动画强度（关闭/低/正常）、数据文件夹、日志；音频和动效设置分别生效。
- “立即备份数据库”“从备份恢复（覆盖前自动再备份）”“导出当前比赛数据”。
- 显示本地数据库位置、总历史场次、数据库大小与版本。

---

## 5. Genpact 当前品牌风格与 UI 设计系统

### 5.1 品牌依据与版本边界

- Genpact 于 **2025-09-08** 正式宣布全球品牌更新，推出 **“on it”** 品牌表达。官方新闻稿：<https://media.genpact.com/2025-09-08-Genpact-Marks-Next-Phase-as-Advanced-Technology-Company-with-Global-Rebrand>。
- Genpact 对外的新视觉更加突出**简洁、强对比、大标题、抽象流动的 AI 视觉元素**；Adobe 与 Genpact 的公开案例进一步描述其动态、可适配的品牌视觉：<https://business.adobe.com/customer-success-stories/genpact.html>。
- 网上可获得的 **Genpact Brand Playbook v0.5（2025 年 20 周年版）** 包含明确的颜色与 Funnel Sans 字体参考：<https://cdn.vev.design/private/qBnShO4mBVUmjCGjZ328c5cl6zy2/1dbcdu-genpact-playbook-v-0-5.pdf>。**但该手册可能早于 2025 年 9 月品牌更新，不能据此宣称其 Token 是 2026 年公司最新强制规范。**
- **开发前品牌门禁**：向公司品牌/设计相关负责人取得最新 Logo、字体授权、色板或内部 Design System；如与本节冲突，**内部最新批准规范优先**。

### 5.2 视觉方向

> **Enterprise × Modern × High-contrast × Energetic**  
> 黑白/深灰为基础，以珊瑚红为主强调，适度使用暖金色表示倒计时预警；尽量避免过去方案里的大面积蓝紫霓虹、过度游戏化拟物按钮。

**候选色板（来源于公开 2025 Brand Playbook，待内部复核）**：

| Token | 候选色值 | 用途 |
|---|---|---|
| `--gp-midnight` | `#161916` | 大屏深色背景 |
| `--gp-white` | `#FFFFFF` | 主要文字 |
| `--gp-sunrise-white` | `#FFFAF4` | 浅色页面背景 |
| `--gp-first-light-01` | `#444744` | 次级表面/深灰 |
| `--gp-first-light-02` | `#6D706B` | 次要文字/分割 |
| `--gp-first-light-03` | `#ADB1AC` | 浅边界/次级信息 |
| `--gp-coral` | `#FF555F` | 品牌强调、主按钮、倒计时危险阶段 |
| `--gp-sunrise-gold` | `#FFAD28` | 时间警示、排名强调 |
| `--gp-sunrise-cream` | `#FFF2DF` | 轻强调背景 |

**非品牌语义色（项目自行定义，需确保对比度）**：正确、跳过、信息提示可使用中性色形状/文字/图标区分，不强制要求每个动作都有高饱和度彩色底。

**CSS Token 草案**：

```css
:root {
  --gp-midnight: #161916;
  --gp-white: #ffffff;
  --gp-coral: #ff555f;
  --gp-gold: #ffad28;
  --gp-surface: #242824; /* 项目候选，不是官方品牌色 */
  --gp-border: #444744;
  --gp-muted: #adb1ac;
  --radius-card: 16px;
  --radius-control: 10px;
  --motion-fast: 180ms;
}
```

### 5.3 字体、品牌 Logo、动效

- 英文字体：公开 2025 Playbook 曾使用 **Funnel Sans**，可作为视觉参考；如内部新规范指定其他字体则替换。中文回退建议 `Microsoft YaHei UI`, `Noto Sans SC`, `sans-serif`，确保 Windows 离线环境可以显示。
- 大屏题目优先使用**中文清晰度高的字体**，不要为了西文字体统一牺牲中文笔画可读性。
- Logo 仅使用获批原始 SVG/PNG；不得手工重绘、改变比例、加入不被允许的描边/渐变。
- 可以出现简洁的“on it”风格短句，但**不要把内部小游戏包装成官方 Genpact 对外发布产品**。
- **动画实现**：`motion` 负责题目淡入、切队、榜单揭晓，`react-countup` 负责比分数字，`canvas-confetti` 负责答对/唯一冠军的轻量撒花，`lottie-react` 负责本地 JSON 奖杯/庆祝场景。避免为每一个按钮引入过多动效。
- **时间效果**：`react-countdown-circle-timer` 用于圆环与时间颜色渐变；权威时钟继续由 Electron Main 维护，React hook `useTurnClock` 仅做同步显示。
- **效果约束**：默认启用适度反馈，提供 `off / low / normal`；遵循 `prefers-reduced-motion`；动效不延迟 IPC 判题、不影响键盘焦点、不遮挡公开题目、不占用主要计时 CPU。
- **音效实现**：`use-sound`（基于 howler.js）只加载安装包内音频资源，播放“开始/答对/跳过/最后 10 秒/结束”，静音、主音量及防重复播放统一管理。
- 颜色与字体、字重、圆角、阴影均由 CSS Token 管理，便于后期一次替换为企业最终规范。

### 5.4 UI 状态与可访问性

- 大屏和管理页均有 `default / hover / active / disabled / focus / loading / error` 状态。
- 键盘操作可见焦点，按钮尺寸满足投影电脑上快速点击。
- 题目/倒计时须在 1366×768 和 1920×1080 测试，不允许“答对按钮”落出视口。
- 倒计时变化不仅靠颜色，还要靠数字/文案/音效；静音时仍可清楚识别超时。

---

## 6. 推荐技术栈与选型理由（React 版）

### 6.1 技术栈总览

| 领域 | 推荐技术 | 选择理由与使用边界 | 优先级 |
|---|---|---|---|
| 桌面容器 | **Electron** | 本地窗口、IPC、文件对话框、Windows 安装/便携包 | P0 |
| 语言/运行时 | **TypeScript + Electron 内置 Node.js** | Renderer、Preload、Main 共享类型；不依赖目标电脑安装 Node | P0 |
| UI 框架 | **React 19 + React DOM** | 全部页面与组件采用函数组件、Hooks、TSX | P0 |
| 构建 | **Vite + electron-vite + @vitejs/plugin-react** | main / preload / renderer 独立构建；React 热更新 | P0 |
| 路由 | **React Router** | 本地 SPA 页面导航；路由不存储业务事实 | P0 |
| Renderer 状态 | **Zustand** | 表单草稿、界面偏好、最新快照缓存；Main 仍是权威事实来源 | P0 |
| 样式 | **Tailwind CSS 4 + CSS Variables** | 自定义 Genpact 主题 Token；配合 Vite Tailwind 插件 | P0 |
| UI 组件 | **shadcn/ui** | Dialog、Button、Input、Select、Table、Tabs、Tooltip 等基础控件；大屏题目区与分数栏自定义 | P0 |
| 图标 | **lucide-react** | React 版本的线性图标，与 shadcn/ui 统一 | P0 |
| 本地数据库 | **SQLite + better-sqlite3** | 事务计分、挑战历史、题目去重、恢复及审计 | P0 |
| 数据迁移 | SQL migrations + `user_version` 或迁移器 | 版本化、可回滚/备份的本地数据库升级 | P0 |
| Excel 读写 | **ExcelJS** | `.xlsx` 导入、模板、题库与成绩导出，放在 Main 服务层/后台解析任务 | P0 |
| CSV | **Papa Parse** | `.csv` 读取、编码及行级校验，独立于 ExcelJS | P0 |
| 参数校验 | **Zod** | IPC 入参出参、表单、Excel 行校验 | P0 |
| ID/命令幂等 | `crypto.randomUUID()` | 命令 ID、游戏 ID、事件 ID | P0 |
| 倒计时圆环 | **react-countdown-circle-timer** | 仅做投影显示，不掌握时间终态与超时判定 | P0 |
| 计时协调 | **自定义 `useTurnClock` + Main TimerEngine** | hook 消费 IPC 快照、使用单调时钟计算展示值；Main 是唯一裁决者 | P0 |
| 撒花特效 | **canvas-confetti** | 答对轻反馈、正式冠军庆祝；需限制粒子数并尊重降低动画 | P0 |
| Lottie 动画 | **lottie-react** | 本地 JSON 奖杯/庆祝动画；素材需核对授权 | P0 |
| 过场与排序动效 | **motion**（`motion/react`） | 切题、排名揭晓、状态过场，避免强制长动画 | P0 |
| 数字滚动 | **react-countup** | 比分、最终得分展示；不承担业务分数计算 | P0 |
| 音效 | **use-sound + howler.js** | 播放本地短音效、静音和音量；音频素材离线内置 | P0 |
| 音效源 | **Kenney / Pixabay / Mixkit** | 按单个音频文件核对授权，优先 Kenney CC0 | P0 |
| 动画素材源 | **LottieFiles（逐件核验）** | 只打包许可允许本地嵌入的素材；不走外部 CDN | P0 |
| 日志 | **electron-log**（可选） | Electron 本地诊断日志，不含无必要的个人数据 | P1 |
| 单元/集成测试 | **Vitest** | 状态机、SQLite 事务、音效事件去重与时间计算测试 | P0 |
| React 组件测试 | **React Testing Library + @testing-library/user-event** | 表单、焦点、按钮、倒计时与减少动画测试 | P0 |
| 桌面 E2E | **Playwright Electron** | 真实窗口、IPC、键盘、导入/导出、异常恢复 | P0 |
| 打包 | **electron-builder** | Windows NSIS + Portable，原生模块重建 | P0 |
| CI | **GitHub Actions Windows Runner**（可选） | Windows x64 自动构建及 smoke test | P1 |
| 可视化 | **ECharts**（可选） | 仅 P1 历史趋势分析；V1 无需引入 | P1 |

> **依赖治理**：创建仓库时选择兼容的稳定版本，锁定 `pnpm-lock.yaml`，并在 Windows x64 实测。`shadcn/ui` 的组件代码进入仓库，应在设计 Token 适配后统一维护。无需使用 Next.js、SSR、远程 API、WebSocket、Vue 或 Pinia。Vue 版原规格中的任何示例均以本 v1.2 React 方案为准。

### 6.2 为什么继续用 SQLite，而不是 localStorage/后端

- `localStorage` 仅适合轻量设置，不适合多场比赛、逐题事件、队伍排名、计分修正和持久事务。
- SQLite 在同一事务内完成 `判题 + 占用题目 + 计分 + 更新当前指针 + 追加事件`，满足 v1.1 已冻结的数据约束。
- 数据库与 Excel 解析在 Electron Main 域处理；Renderer 不读写 SQLite 文件，也不直接访问 `fs`。
- `better-sqlite3` 是原生模块，打包时需针对 Electron ABI/Windows x64 重建并验证 `asarUnpack`；需要检查签名及企业防护策略。
- ExcelJS 的 `.xlsx` 文档式 Workbook 可在 Main 读写；**不在 Renderer 解析不受信任的工作簿**，避免大文件影响大屏渲染与暴露磁盘操作。CSV 通过 Papa Parse 独立处理。文件格式限制、单元格数/解压膨胀风险、公式文本转义由服务层校验；大文件应按任务分批或后台线程处理。
- **不选 npm 旧版 `xlsx`（SheetJS CE）作为默认依赖**：公开 npm 包版本存在已知的 [原型污染 CVE-2023-30533](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) 和 [ReDoS CVE-2024-22363](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) 风险；SheetJS 的新版由其他渠道分发。选择 ExcelJS 是为了更符合本项目的 `.xlsx` 读写与 npm 依赖管理，**不等于 ExcelJS 无漏洞**：每次锁版本后仍需做依赖审计、异常文件/ZIP Bomb 测试和资源上限保护。

### 6.3 Electron 三层安全架构

```text
┌──────────────────────────────────────────────────────────────────┐
│ Renderer（React 19 + React Router + Zustand + shadcn/ui）        │
│  P01-P10 页面 / 主题 / 原生大屏 UI / 计时圆环 / 动画 / 音效      │
│  只能通过 gameAPI 获取业务快照、提交意图；不能访问 Node/SQLite   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ window.gameAPI（受限白名单）
┌──────────────────────────────▼───────────────────────────────────┐
│ Preload（contextBridge）                                         │
│  窄接口 + 类型化 DTO + 校验 + 事件订阅/取消，禁止暴露原始 IPC      │
└──────────────────────────────┬───────────────────────────────────┘
                               │ IPC（校验 sender / payload / 状态）
┌──────────────────────────────▼───────────────────────────────────┐
│ Main（Electron）                                                 │
│  GameEngine / TimerEngine / QuestionEngine / SQLite              │
│  ExcelJS / Papa Parse / Export / Backup / FileDialog             │
│  向 Renderer 发送权威快照和提交后的领域事件                       │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                     SQLite / 文件 / 备份
```

必须启用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`，限制页面导航、新窗口、权限请求和任意外链，启用合适 CSP，并加载安装包内可信资源。具体安全要求参见 <https://www.electronjs.org/docs/latest/tutorial/security/>。

### 6.4 建议的 IPC API（逻辑类型契约）

```typescript
interface GameApi {
  questions: {
    importExcel(): Promise<ImportResult>; // Main 弹文件选择器，处理 xlsx/csv
    listBanks(): Promise<QuestionBankSummary[]>;
    list(query: QuestionQuery): Promise<QuestionPage>;
    exportTemplate(): Promise<void>;
    exportBank(input: { bankId: string; format: 'xlsx' }): Promise<void>;
  };
  games: {
    create(config: CreateGameInput): Promise<GameSnapshot>;
    get(id: string): Promise<GameSnapshot>;
    list(query: GameQuery): Promise<GamePage>;
    getHistory(id: string): Promise<GameHistory>;
    startTurn(gameId: string): Promise<GameSnapshot>;
    submitAnswer(input: SubmitAnswerInput): Promise<GameCommandResult>;
    pause(gameId: string): Promise<GameSnapshot>;
    resume(gameId: string): Promise<GameSnapshot>;
    undoLastAnswer(gameId: string): Promise<GameCommandResult>;
    finishTurn(gameId: string): Promise<GameSnapshot>;
    advanceToNextTeam(gameId: string): Promise<GameSnapshot>;
    adjustScore(input: ScoreAdjustmentInput): Promise<GameSnapshot>;
    abortGame(input: { gameId: string; reason: string; commandId: string }): Promise<GameSnapshot>;
    exportResults(gameId: string): Promise<void>;
  };
  app: {
    setFullscreen(enabled: boolean): Promise<void>;
    backupDatabase(): Promise<void>;
    restoreDatabase(): Promise<void>;
    getSettings(): Promise<AppSettings>;
    updateSettings(input: AppSettingsPatch): Promise<AppSettings>;
  };
  events: {
    subscribe(handler: (event: GameUiEvent) => void): () => void;
  };
}

type GameCommandResult = {
  snapshot: GameSnapshot;
  applied: boolean; // false = 幂等重复或被拒绝，不触发重复特效
  eventId?: string;
};

type GameUiEvent = {
  eventId: string;
  gameId: string;
  kind: 'ANSWER_ACCEPTED' | 'TURN_STARTED' | 'TURN_ENDED'
      | 'GAME_FINISHED' | 'GAME_FINISHED_EARLY' | 'GAME_ABORTED';
  verdict?: 'CORRECT' | 'SKIPPED' | 'TIMEOUT';
  emittedAt: string;
};
```

**约束**：上述类型展示核心接口而非可直接编译的项目完整 DTO；正式 DTO 位于 `src/shared`。事件必须在主进程事务提交后发送；旧 `commandId`、stale 题目、0 秒越界命令绝不能触发特效。`subscribe` 必须返回取消订阅函数，组件卸载时清理监听器，不能允许 Renderer 订阅任意 IPC 通道。

### 6.5 React 组件与游戏状态的职责边界

1. `useGameSnapshot(gameId)`：订阅主进程提交后的快照，处理加载/重连/重复版本，**禁止基于前端局部值自行决定加分或换题**。
2. `useTurnClock()`：消费 Main 下发的剩余时长、挑战状态与同步版本，按 Renderer 的本地单调时间进行**显示级插值**；最终归零和判题合法性只由 Main 决定。不要跨 Main/Renderer 进程直接比较 `performance.now()` 值。
3. `CountdownRing.tsx`：使用 `react-countdown-circle-timer` 展示圆环；用 `isPlaying` 暂停/恢复，`initialRemainingTime` 初始同步剩余秒数，`key` 只在换挑战/显著重新同步时重建，**不能每个 render 重置 key**；`onComplete` 不发结束挑战命令。
4. `useGameHotkeys()`：`Space` 暂停、`Enter` 答对、`ArrowRight` 跳过、`Ctrl+Z` 撤销。输入框、文本编辑、弹窗焦点、重复键、暂停/终态必须阻断；提交带稳定 `commandId`、`turnId`、`currentQueueItemId`，并在 Main 二次校验。
5. `useGameEffects()`：从主进程已提交领域事件触发 `canvas-confetti`、`lottie-react`、`motion`、`react-countup`、`use-sound`；根据 `eventId` 去重。历史页、异常恢复、重新订阅不会补放旧烟花或重复音效。
6. `Zustand`：只缓存界面草稿/筛选/非权威快照，不在 store 内维护另一套可变队伍总分或题目使用集合。React Router 路由由 GameState/TurnState 推导恢复。
7. 大屏 `QuestionDisplay` 和计时数字优先无动画首帧可见，`motion` 只是过场；有障碍设置或低性能设备可立即关闭所有动画，但功能不变。

**倒计时环示例（仅 UI 示意，不替代业务计时器）**：

```tsx
import { CountdownCircleTimer } from 'react-countdown-circle-timer';

type RingProps = {
  turnId: string;
  syncRevision: number;
  durationSeconds: number;
  syncRemainingSeconds: number;
  isRunning: boolean;
  displayRemainingMs: number;
};

export function CountdownRing({
  turnId, syncRevision, durationSeconds, syncRemainingSeconds,
  isRunning, displayRemainingMs,
}: RingProps) {
  return (
    <CountdownCircleTimer
      key={`${turnId}:${syncRevision}`}
      isPlaying={isRunning}
      duration={durationSeconds}
      initialRemainingTime={Math.min(durationSeconds, syncRemainingSeconds)}
      colors={['#FFFFFF', '#FFAD28', '#FF555F']}
      colorsTime={[durationSeconds, Math.min(10, durationSeconds), 0]}
      size={320}
      strokeWidth={20}
      onComplete={() => undefined} // 绝不在此调用 finishTurn()
    >
      {() => <span>{Math.ceil(displayRemainingMs / 1000)}s</span>}
    </CountdownCircleTimer>
  );
}
```

> `syncRevision` 应只在新 Turn、暂停/恢复后的初始化或漂移超过阈值的权威重新同步时变化；常规 50–100ms 展示更新只改变 `displayRemainingMs`。若组件内动画与权威时间出现差异，以 Main 快照数字为准，必要时重置圆环。Main 必须对 `TURN_RUNNING` 精确定时，并在截止时刻提交幂等 `TIMEOUT`。

### 6.6 音效与动画触发策略

| 场景 | 组件 | 触发和约束 |
|---|---|---|
| 开始挑战 | `use-sound` | Main `TURN_STARTED` 事件到达后播放一次；若声音未解锁则静默降级 |
| 答对 | `canvas-confetti` + `react-countup` + `use-sound` | Main 接受 `CORRECT` 且事务提交后，低粒子量撒花、分数滚动、短音；不阻塞立即切题 |
| 跳过 | `use-sound` | Main 接受 `SKIPPED` 后播放简短柔和提示；不播放失败惩罚音 |
| 倒数 10 秒 | `use-sound` | 仅当前运行挑战的整秒边界播放，10..1 各一次；暂停/恢复不重播同一秒，重启恢复默认不补播 |
| 时间结束 | `use-sound` + `motion` | Main `TURN_ENDED` 正式事件后提示；显示 TIME UP；不再接受答对 |
| 切队/排名揭晓 | `motion` | 120–300ms；不能延迟下一队“手动开始”逻辑 |
| 正常结束且唯一冠军 | `lottie-react` + `canvas-confetti` | `GAME_FINISHED` 并且排名唯一第一才播放奖杯/庆祝；并列第一只展示并列结果 |
| 题库耗尽/比赛中止 | `motion`（轻提示） | `FINISHED_EARLY/ABORTED` 禁用冠军烟花/奖杯和胜利音，突出原因 |

- 动效均是 **Renderer 的非权威、可失败副作用**；库报错不得回滚已提交的比赛事件。React Strict Mode 双执行 effect 时也不能重复播放：用已见 `eventId` 集合/一次性事件队列守护。
- 实现 `useReducedMotion`（来自 `motion/react` 或 `matchMedia`）及应用内 `effectLevel`；优先遵守系统降低动态效果设置；`canvas-confetti` 设置 `disableForReducedMotion: true`，并限制粒子数/频率，避免 12 队时持续渲染拖慢计时 UI。
- Lottie JSON、`.mp3/.ogg` 音效、必要品牌资源全部随 Electron 包本地分发，不能依赖 LottieFiles CDN、Pixabay 音频流或运行期下载。
- `use-sound` 底层为 howler.js，建议封装 `AudioProvider/useGameAudio` 集中控制 mute/volume、播放队列、重叠抑制和 React Hook 生命周期，不允许各页面直接拼接随机 URL。
- 推荐声音数量：`start`, `correct`, `skip`, `tick`, `time-up`, `champion`；音频缺失时 UI 功能和计时不受影响。

### 6.7 免费素材来源、授权与企业使用限制

| 来源 | 资源类型 | 许可与注意事项 | V1 建议 |
|---|---|---|---|
| [Kenney Audio](https://kenney.nl/assets/category:Audio) | 交互/游戏音效 | 官方称资产页素材为 **CC0**，商业项目可用，通常无需署名；逐资源保留许可文件 | **首选** |
| [Pixabay Sound Effects](https://pixabay.com/sound-effects/) | 音效 | Pixabay Content License 允许免费使用与通常无需署名，但禁止把素材独立转售/分发；留意额外第三方权益 | 补充 |
| [Mixkit Game SFX](https://mixkit.co/free-sound-effects/game/) | 音效 | Free Sound Effects License 允许商业 End Product 与电子游戏使用，但限制单独分发/作为素材库模板分发 | 补充 |
| [LottieFiles License](https://lottiefiles.com/page/license) | 奖杯/庆祝 JSON | **公开免费动画**按 Lottie Simple License 可商用且无需强制署名，但再分发/修改作品应保留该许可证条件；**制作工具账户/订阅的商业使用限制是另一回事**；逐条核验实际素材 | 仅选清晰许可作品 |

**必须提供 `resources/assets/LICENSES.md`（或 `asset-manifest.json`）**：逐个记录文件名、素材作者、来源 URL、下载日期、许可证名称与版本、是否允许修改/嵌入/再分发、授权凭据归档位置。不要只写“来自免费平台”而不记录资源具体 URL；公司内部的 Logo、字体与商标素材需单独走公司审批。

- 企业内部团建工具也属于企业场景；若使用 LottieFiles 的**编辑、制作或私有云服务**，须评估对应账户的商业使用条款，不能把“免费动画文件可商用”误推成“免费账户下所有创作/服务均可商业使用”。
- `.mp3/.ogg` 和 Lottie JSON 可随桌面程序集成；不要作为单独素材下载/素材市场模块提供，遵守各站点的禁止独立转售/分发约束。保留本地离线许可证说明，尤其 Lottie Simple License 的再分发附带条款。
- 未找到许可清晰的动画时，**退化为纯 CSS/Motion 图形或自制原创 SVG 动画**，而不是下载不明版权的素材；该退化不影响业务 P0 验收。

---

## 7. 核心状态机和关键算法

### 7.1 两个独立状态机（P0 冻结契约）

**GameState（持久化到 `games.status`）**：

| 状态 | 含义 | 允许下一步 |
|---|---|---|
| `GAME_READY` | 比赛已创建，第一场挑战未开始 | `GAME_ACTIVE`、`GAME_ABORTED` |
| `GAME_ACTIVE` | 至少一次挑战已开始，赛程未整体结束；当前挑战可为 READY/RUNNING/PAUSED/FINISHED | `GAME_FINISHED`、`GAME_FINISHED_EARLY`、`GAME_ABORTED` |
| `GAME_FINISHED` | 全部计划挑战正常完成 | 仅查看/修正/导出/归档 |
| `GAME_FINISHED_EARLY` | 当前挑战提前耗尽，或归零后仍有计划挑战却无剩余题目 | 仅查看/修正/导出/归档 |
| `GAME_ABORTED` | 主持人明确中止整场比赛 | 仅查看/修正/导出/归档 |

`GAME_DRAFT` 仅指前端尚未提交的设置表单，不进入 `games` 表；归档字段为 `games.archived_at`（可空），不占用 `games.status`。列表中的“已暂停”是当前挑战状态衍生的标签，不是 `GameState`。

**TurnState（持久化到 `game_turns.status`）**：

| 状态 | 含义 | 下一状态 |
|---|---|---|
| `TURN_PENDING` | 尚未轮到该队（创建比赛时预生成全部计划挑战） | `TURN_READY` / `TURN_NOT_PLAYED` |
| `TURN_READY` | 已轮到该队，主持人尚未点开始 | `TURN_RUNNING` / `TURN_NOT_PLAYED` |
| `TURN_RUNNING` | 正在倒计时，有且仅有一道 `CURRENT` 题 | `TURN_PAUSED` / `TURN_FINISHED` / `TURN_EXHAUSTED` / `TURN_ABORTED` |
| `TURN_PAUSED` | 显式暂停或从异常退出恢复 | `TURN_RUNNING` / `TURN_ABORTED` |
| `TURN_FINISHED` | 倒计时到 0，完成结算 | 终态 |
| `TURN_EXHAUSTED` | 仍有有效时间但已无可分配的新题 | 终态 |
| `TURN_NOT_PLAYED` | 尚未进行，因题目耗尽/中止而取消 | 终态 |
| `TURN_ABORTED` | 主持人中止时正在进行的挑战 | 终态 |

- 每场比赛按 `round_no, sequence_no` 生成固定排程，首次创建时仅第一个挑战是 `TURN_READY`，其余为 `TURN_PENDING`。
- `games.current_turn_id` 指向本场**当前挑战**。从单队结算点击“下一队准备”时，才将它更新为下一项，下一项从 `TURN_PENDING` 变为 `TURN_READY`。比赛整体结束时可保留最后挑战指针供历史展示，但不得再启动。
- `game_turns.current_queue_item_id` 指向当前题；只有 `TURN_RUNNING` / `TURN_PAUSED` 可以持有非空指针；任何挑战进入终态时须在同一事务内清空该指针。一个 Game 同一时刻最多有一个 `CURRENT` 队列项（数据库唯一索引）。
- 若题库只有 1 题，启动挑战可以显示该题；其后正确/跳过且有剩余时间但无后续题时进入耗尽分支，而不是重抽。

**正常流转**：`GAME_READY + TURN_READY` → `GAME_ACTIVE + TURN_RUNNING` ↔ `TURN_PAUSED` → `TURN_FINISHED` → 单队结算 P06 → `TURN_READY` 下一队；所有预定挑战 `TURN_FINISHED` → `GAME_FINISHED`。

**耗尽流转**：`TURN_RUNNING` 判题后发现新题数量为 0 → 当前 `TURN_EXHAUSTED`；其余 `TURN_PENDING/TURN_READY` → `TURN_NOT_PLAYED`（`end_reason=POOL_EXHAUSTED`）；整场 → `GAME_FINISHED_EARLY`，**无论当前是不是最后一场挑战**。如在零秒边界，到期优先：当前 `TURN_FINISHED`；若还有计划挑战但已无可用题，剩余挑战记 `TURN_NOT_PLAYED` 且整场 `GAME_FINISHED_EARLY`；若所有挑战均 `TURN_FINISHED`，整场 `GAME_FINISHED`。

**手动中止整场**（P0）：在准备页、暂停页或结算页，主持人二次确认并填写可选原因；正在 `TURN_RUNNING` 时先原子地暂停并二次确认后才能中止。当前 `CURRENT` 题标 `VOIDED` + `USER_ABORTED` 原因并清空当前题指针（继续视为已用），只有当前 `TURN_RUNNING/PAUSED` 挑战记 `TURN_ABORTED`，已经完成的挑战保持原终态；未进行挑战记 `TURN_NOT_PLAYED` + `USER_ABORTED`；整场记 `GAME_ABORTED`。保留部分成绩，但不宣布冠军。操作写审计日志，不能与 `finishTurn`、`submitAnswer` 并发双提交。

### 7.2 异常退出及重启恢复矩阵（P0）

恢复流程在打开主窗口前由 Main 进程执行：数据库完整性与指针一致性校验 → 原子写入恢复事件及必要状态修正 → 路由至以下页面；禁止自动计时、自动抽题、自动修分。

| 关闭前持久状态 | 重启后的状态/页面 | 数据与题目行为 |
|---|---|---|
| `GAME_READY / TURN_READY` | 状态不变 → P04 准备页 | 不分配新题；等待主持人开始 |
| `GAME_ACTIVE / TURN_READY` | 不变 → P04 下一队准备 | 保留排程顺序，不自动开表 |
| `GAME_ACTIVE / TURN_RUNNING` | **`TURN_PAUSED`** → P05 暂停页 | 使用最后落盘的 `remaining_ms` 检查点，保留指针供后续结算，暂停页隐藏原题，继续时换题。增加 `RECOVERED_TO_PAUSED` 事件 |
| `GAME_ACTIVE / TURN_PAUSED` | 保持 PAUSED → P05 暂停页 | 保留剩余时长和撤销事件，暂停页隐藏原题，继续时换题 |
| `GAME_ACTIVE / TURN_FINISHED` | 不改状态 → P06 单队结算 | `current_turn_id` 保持，等主持人点击“下一队准备” |
| `GAME_FINISHED` | P07 正式排行榜 / 历史详情 | 不显示开始按钮，支持修正与导出 |
| `GAME_FINISHED_EARLY` | P07 提前结束积分榜 / 历史详情 | 保留未进行队伍标记，不给冠军 |
| `GAME_ABORTED` | 历史详情（中止标识） | 只能查看、修正与导出，不可继续 |
| 任意状态发现两个 `CURRENT`、非法 FK、分数不一致等 | `RECOVERY_REQUIRED` **维护锁**（恢复流程状态，非普通比赛状态） | 禁止开始/判题/改分，先安全备份并显示可诊断原因，不静默“修好” |

- 事务已提交但 UI 还没展示新题时发生崩溃：该题已记为已用，恢复后隐藏，继续时换题。
- 事务写到一半崩溃：SQLite 回滚整笔事务，恢复前状态；不得出现“分数已加但新题指针未更新”的部分成功。
- 撤销后崩溃：已撤销题保持作废，当前题恢复后隐藏，继续时换题。
- 导航无独立持久化页面字段：**由 GameState、TurnState、`current_turn_id` 及终态推导页面**，避免存储路由和游戏状态互相矛盾。

### 7.3 计时策略与超时优先级

- **主进程计时引擎为唯一权威**：用单调时钟（例如 `performance.now()`）和本次启动的绝对截止时刻计算 `remainingMs`；React `useTurnClock`/圆环组件仅负责展示；切勿从圆环 `onComplete` 发出结算指令。
- 约每 1 秒落盘 `remaining_ms` 检查点；开始、暂停、答题、撤销、切题、结束时立即持久化。崩溃后只使用**最后持久化时长**，恢复状态为 PAUSED；不跨进程复用单调基准。
- `submitAnswer` 同步检查当前截止时刻，`remainingMs <= 0` 时优先执行超时结算并拒绝答题；`GAME_FINISHED*`、`GAME_ABORTED`、`TURN_FINISHED/EXHAUSTED/NOT_PLAYED/ABORTED` 均不得继续判题。
- 倒计时 0 后音效、结算、超时事件幂等执行一次；React 音效/特效由事务提交后的唯一 `eventId` 驱动；后台大型 Excel 导入、数据库恢复/备份操作在 `TURN_RUNNING` 时禁用。
- Windows 上活跃挑战期间使用 `powerSaveBlocker` 并在结束/暂停/中止时正确释放；切窗口不直接结束游戏。

### 7.4 创建比赛、题目分配与耗尽算法

1. 创建时核对当前筛选题库有效题数至少 `1`；按 `normalized_text` 全局去重、固定洗牌并保存完整队列及**题目快照**。
2. `startTurn` 在同一事务内验证 `GAME_READY/ACTIVE`、挑战状态 `TURN_READY`、全局无其他 `CURRENT`、可用题数至少 `1`；将下一 `UNUSED` 项标为 `CURRENT`，写 `first_allocated_at`, `shown_turn_id` 和 `current_queue_item_id`，然后才通知 Renderer 展示。
3. `submitAnswer` 在同一 SQLite 写事务内完成**状态与时钟校验 → 命令幂等判断 → 原题判定 `JUDGED` → 事件追加 → 分数增加 → 分配下题或耗尽结算 → 更新指针 → 提交**。
4. `UNDO` 见 2.5；先将未判定的下题标 `VOIDED`，再把上题恢复 `CURRENT`，不回退计时，不释放已用题。
5. 若无下一题且仍有时间，当前挑战按 `TURN_EXHAUSTED` 结束，剩余挑战 `TURN_NOT_PLAYED`；否则计时归零按 `timeout` 结束。由于所有变更同事务提交，进程或多次操作不能生成两个 `CURRENT`。

**术语**：`UNUSED` = 从未分配；`CURRENT` = 当前正在展示；`JUDGED` = 已有 `correct/skipped/timeout` 生效判定；`VOIDED` = 曾分配展示但被撤销过程作废或中止，永不重新放回队列。**首次分配记录不可删除**。

### 7.5 分数与指令幂等

- 每条操作请求包括稳定 `commandId`（UUID）和期望 `turnId`、`currentQueueItemId`。重复 `commandId` 返回先前结果/当前一致快照，不执行第二遍；使用不同 commandId 但同一旧题则拒绝为 stale command。
- `answer_events.action` 枚举固定 `CORRECT | SKIPPED | TIMEOUT | UNDO | VOIDED`；仅 `CORRECT`、`SKIPPED` 和 `TIMEOUT` 是题目判定，`UNDO` 以 `reverts_event_id` 定向撤销最近判定，`VOIDED` 记录下一题作废。`RECOVERED_TO_PAUSED`、`TURN_ABORTED`、比赛结束/中止等生命周期操作归入 `game_events.action`。所有事件只追加，不删除，不在界面上冒充尚未撤销的有效判定。
- 各挑战当前分数 = 当前有效判定积分之和 + **该挑战**人工修正之和；队伍总分 = 各挑战当前分数之和 + **队伍级**人工修正之和。
- 所有积分缓存更新、事件日志、`current_queue_item_id`、`game_question_queue` 状态、回合结束标识必须在**同一事务**中提交；统计和导出使用同一套重算口径。UI 动效只消费提交后事件，不能独立先加分。
- `GAME_FINISHED` 或 `GAME_FINISHED_EARLY` 允许有原因的人工修正，**不重开游戏状态**；修正后重新计算正式排名/提前结束榜单，历史和导出即时反映。`GAME_ABORTED` 亦可备注修正，但不转换为“完成”。

## 8. 数据库设计（SQLite）

### 8.1 表模型（P0 正式契约）

| 表 | 作用 | 必要字段 |
|---|---|---|
| `question_banks` | 题库元信息 | `id`, `name`, `source_filename`, `imported_at`, `file_sha256`, `active` |
| `questions` | 全局题目规范化实体 | `id`, `text`, `normalized_text UNIQUE`, `category`, `difficulty`, `points`, `active` |
| `bank_questions` | 题库与题目多对多 | `bank_id`, `question_id`，复合唯一键 |
| `games` | 一场比赛的冻结配置和状态 | `id`, `name`, `status`, `end_reason NULL`, `round_count`, `turn_duration_ms`, `score_mode`, `current_turn_id NULL`, `planned_turn_count`, `archived_at NULL`, `created_at`, `started_at`, `ended_at` |
| `game_teams` | 比赛队伍快照 | `id`, `game_id`, `sort_order`, `name`, `color`, `total_score` |
| `game_turns` | 预生成的每队每轮挑战 | `id`, `game_id`, `team_id`, `round_no`, `sequence_no`, `status`, `end_reason NULL`, `current_queue_item_id NULL`, `remaining_ms`, `turn_score`, `started_at NULL`, `ended_at NULL` |
| `game_question_queue` | 固定顺序、题目快照及使用状态 | `id`, `game_id`, `question_id`, `queue_position`, `state`, `shown_turn_id NULL`, `first_allocated_at NULL`, `verdict NULL`, `question_text_snapshot`, `normalized_text_snapshot`, `category_snapshot`, `difficulty_snapshot`, `points_snapshot` |
| `answer_events` | 不可变操作/判定/撤销审计日志 | `id`, `game_id`, `turn_id`, `queue_item_id NULL`, `command_id UNIQUE`, `action`, `score_delta`, `remaining_ms NULL`, `occurred_at`, `reverts_event_id NULL`, `reason NULL` |
| `score_adjustments` | 人工修正审计 | `id`, `game_id`, `team_id`, `turn_id NULL`, `command_id UNIQUE`, `delta`, `previous_team_score`, `new_team_score`, `previous_turn_score NULL`, `new_turn_score NULL`, `reason`, `created_at` |
| `game_events` | 生命周期与恢复事件 | `id`, `game_id`, `turn_id NULL`, `command_id UNIQUE`, `action`, `reason NULL`, `created_at` |
| `app_settings` | 本地设置 | `key`, `value_json`, `updated_at` |
| `schema_migrations` | schema 版本迁移 | `version`, `applied_at` |

- `question_text_snapshot` 等**创建比赛时必须写入**，不是“实现时可选”。比赛创建后全局题库数据可修改，但队列快照不能变化。
- `shown_turn_id` 表示**首次分配给哪一次挑战**，即使撤销作废也不清空；`first_allocated_at` 同理不清空。
- `answer_events.queue_item_id` 是操作当时的**比赛题目队列项**，避免仅靠 `question_id` 在撤销/审计中定位不清；计分依靠该项的题目分值快照。
- `score_adjustments.turn_id = NULL` 表示队伍级额外修正，仅影响 `game_teams.total_score`；非空表示修正该次挑战，同时影响该挑战 `turn_score` 和队伍总分。前后字段应与目标粒度匹配，且 `reason` 必填。
- 记录本地操作员身份可采用固定字符串 `LOCAL_HOST`；无账号系统不应伪造人员可追溯性，至少保留主机操作时间与原因。

### 8.2 枚举、约束、索引与事务

**强制枚举**：

- `games.status`: `GAME_READY | GAME_ACTIVE | GAME_FINISHED | GAME_FINISHED_EARLY | GAME_ABORTED`。
- `games.end_reason`: `NULL | NORMAL_COMPLETE | POOL_EXHAUSTED | USER_ABORTED`。
- `game_turns.status`: `TURN_PENDING | TURN_READY | TURN_RUNNING | TURN_PAUSED | TURN_FINISHED | TURN_EXHAUSTED | TURN_NOT_PLAYED | TURN_ABORTED`。
- `game_turns.end_reason`: `NULL | TIME_UP | POOL_EXHAUSTED | USER_ABORTED`。
- `game_question_queue.state`: `UNUSED | CURRENT | JUDGED | VOIDED`。
- `game_question_queue.verdict`: `NULL | CORRECT | SKIPPED | TIMEOUT`；`UNUSED/CURRENT/VOIDED` 必须为 NULL，只有 `JUDGED` 有有效判定（被撤销后原题回到 CURRENT、verdict 变 NULL）。
- `answer_events.action`: `CORRECT | SKIPPED | TIMEOUT | UNDO | VOIDED`；`game_events.action`: `GAME_CREATED | TURN_ADVANCED | RECOVERED_TO_PAUSED | TURN_ABORTED | GAME_FINISHED | GAME_FINISHED_EARLY | GAME_ABORTED`。

**唯一性约束与示例 SQL**：

```sql
CREATE UNIQUE INDEX uq_game_queue_question
  ON game_question_queue(game_id, question_id);
CREATE UNIQUE INDEX uq_game_queue_order
  ON game_question_queue(game_id, queue_position);
-- 防止同一场比赛存在多道当前题；即使跨挑战也不能同时 CURRENT。
CREATE UNIQUE INDEX uq_one_current_question_per_game
  ON game_question_queue(game_id) WHERE state = 'CURRENT';
-- 每队每轮一场挑战；每场挑战排程序号唯一。
CREATE UNIQUE INDEX uq_turn_team_round
  ON game_turns(game_id, team_id, round_no);
CREATE UNIQUE INDEX uq_turn_sequence
  ON game_turns(game_id, sequence_no);
```

- `games.current_turn_id` 与 `game_turns.current_queue_item_id` 必须使用外键关联，并在应用服务事务中再验证它们**属于同一个 game / turn**；不能仅凭单列 FK 声称跨表作用域正确。
- 约束每次成功提交后的不变量：`TURN_RUNNING/PAUSED` 必有且仅有一个 `CURRENT` 且指针一致；非运行中挑战不持有 CURRENT；`CURRENT.shown_turn_id` 为 `games.current_turn_id`；一个 `CORRECT/SKIPPED` 判定最多有一个生效版本（撤销前事件仍保留）。
- 采用 `BEGIN IMMEDIATE` 等单写者事务序列化游戏指令；`command_id` 唯一键 + 状态预期值用于避免双击及异步 IPC 乱序提交。
- `CHECK` 和 `FOREIGN KEY` 保护本表枚举/非负分数与引用；跨表指针一致性必须补足 Main 进程断言、集成测试，必要时触发器阻止非法写入。
- `PRAGMA foreign_keys=ON`，启用 WAL、合理 `busy_timeout`；SQLite 联机备份必须使用一致性备份 API，不能在 WAL 模式下只复制 `.db`。

### 8.3 人工成绩修正的一致性规则

1. 修分仅在**当前没有 RUNNING/PAUSED 挑战**时开放：P06 已结算页面或比赛历史详情；目标 `turn_id` 如不为空必须属于同一比赛与队伍且挑战已处于终态。主持人输入**整数增量**及必填原因；界面展示旧分与预期新分。
2. Main 进程在事务内重新取当前分数、拒绝负分与过期快照、按目标粒度维护 `turn_score` / `total_score`，写入上表全部前后分数字段和独立 `commandId`。
3. 有 `turn_id`：`previous_turn_score/new_turn_score` 非空且变化量为 `delta`；队伍旧总分/新总分也随之变化；无 `turn_id`：两项挑战分值字段均 NULL，仅更新队伍总分。
4. 同一队伍的展示总分必须等于各挑战分之和加队伍级修正；单次挑战分必须等于有效答题积分加挑战级修正。由这些数据重新计算**实时排行榜、最终排行榜、Excel 导出**，不可只改 UI 内存值。
5. 已完成/提前结束/中止赛事也允许修正，但**不得改变赛事终态**。归档赛事先解除归档再修正（P1 可提供归档解除入口），V1 直接禁止归档状态修正，以免悄悄改写档案。
6. 历史逐题判定不变；修正以独立审计表展示，不伪造成“某题从跳过改答对”。

### 8.4 记录、快照、统计口径

- **比赛总览**：状态、结束原因、计划挑战数、实际完成挑战数、未参加数、已分配题数、已作废题数、当前队伍及日期。
- **队伍成绩**：队伍名、队伍顺序、当前总分、完成挑战次数、答对/跳过/超时、队伍级额外修正。
- **逐题记录**：`queue_item_id`、题目文本/分类/难度/分值快照、首次分配挑战、首次分配时刻、有效判定、撤销历史、作废原因。
- **排名口径**：任何时刻可按当前总分排序并列；仅 `GAME_FINISHED` 标为正式最终排名；`GAME_FINISHED_EARLY` 显示部分赛程积分榜，`GAME_ABORTED` 显示中止时积分榜。
- `total_score` 与 `turn_score` 是事务内维护的缓存，需实现事件重算与一致性巡检；恢复前发现不一致先进入 `RECOVERY_REQUIRED`，禁止自动覆盖审计证据。

### 8.5 数据存储、备份与生命周期

- 正式数据库使用 `path.join(app.getPath('userData'), 'data', 'draw-and-guess.db')`；Windows 通常落在 `%APPDATA%` 的应用数据目录，不写安装包或 `app.asar`。
- `Portable.exe` 默认**不保证**数据与 exe 同目录；如未来需要 U 盘真正便携，须单独开发便携数据目录模式和权限检测。
- 历史默认永久保留；`archived_at` 是属性，不改变 GameState 与题目分配记录。活动中的比赛不能归档。
- SQLite 备份使用 `better-sqlite3` backup API 或等效一致性 API；恢复前再备份当前数据库并验证 schema/version、完整性，关闭旧连接后重新打开。
- 备份恢复后如果存在 `TURN_RUNNING`，仍按 7.2 的恢复矩阵安全转 PAUSED；不得自动启动。
- 若后续 P1 实现归档，归档仅隐藏/标记，不物理删除影响历史审计或跨历史去重的数据。

## 9. Excel 题库格式、校验与导出

### 9.1 Excel 模板

工作表：`题库`，第一行为表头。

| 题目（必填） | 分类 | 难度 | 分值 |
|---|---|---|---:|
| 长颈鹿 | 动物 | 简单 | 1 |
| 火锅 | 美食 | 简单 | 1 |
| 画蛇添足 | 成语 | 中等 | 2 |
| 人工智能 | 科技 | 中等 | 2 |
| 需求变更 | 职场 | 困难 | 3 |

字段约定：

- `题目`：字符串，建议 1–80 字；去掉首尾空白后不能为空。
- `分类`：缺失默认“未分类”；导入不强制限定预设分类。
- `难度`：`普通/简单/中等/困难`，缺失默认“普通”；允许别名映射。
- `分值`：正整数，建议 1–10，缺失默认 1；默认比赛配置可选择忽略该列统一计 1 分。
- 不执行单元格公式，不允许公式值触发外部资源加载；导入时当作静态数据处理并校验。
- 导入须报告重复项以及错误行号；未知列忽略或提示，不能错误移动字段。

### 9.2 题库导出（P0，独立于成绩导出）

- 操作入口：P02 题库管理 → 选中题库 → “导出当前题库”。IPC：`questions.exportBank({bankId, format: "xlsx"})`。
- 导出工作表 `题库`，字段至少为：`题目 | 分类 | 难度 | 分值 | 启用状态`，用**当前题库数据**（不是比赛快照）；额外 `元数据` Sheet 包含题库名称、来源文件名、导入时间、导出时间、软件版本。
- 再导入时可识别上述列；`启用状态` 被识别为启用/禁用。不得将含公式前缀的题目作为可执行 Excel 公式写入。
- 选择文件路径取消不修改题库；写入失败不得留下被认为成功的半成品文件；导出后可重新导入并校验题目数、分类、分值及禁用状态。

### 9.3 成绩导出（一个 Excel 多 Sheet）

- `比赛总览`：名称、开始/结束时间、`game_status`、`end_reason`、队伍数、轮数、计划/完成/未进行挑战次数、计分方式、已使用/已作废题数。
- `队伍排行榜`：名次、队伍名、总分、逐轮得分、答对/跳过数量、完成挑战次数；提前结束时表头标注“部分赛程积分榜，非正式冠军”。
- `答题明细`：轮次、挑战序号、队伍、题目快照、分类、有效判定、得分、剩余时间、时间戳、`queue_item_id`、被撤销记录。
- `成绩修正`：队伍、可空 `turn_id`、修正理由、团队旧分/新分、挑战旧分/新分（可空）、时间、`command_id`。
- `题目使用记录`：`CURRENT/JUDGED/VOIDED` 的完整题目快照、分配时间、使用挑战与作废原因；
- `挑战排程`：全部计划挑战、实际状态、`TURN_NOT_PLAYED` 原因，不得将未参赛项目写成零分参赛。

**CSV/Excel 注入防护**：导出用户输入的题目或队名时，检查 `=`, `+`, `-`, `@` 等可能被表格软件解释为公式的开头，使用安全的字符串单元格和必要转义；不要简单拼 CSV 文本。

---

## 10. 开发仓库与目录设计（React + Electron）

推荐 **一个 Git 仓库 + 一个 Electron 应用 + 一个 SQLite 数据库**；不拆分前后端仓库。所有 React 页面使用 `.tsx`，领域逻辑留在主进程可测试 TypeScript 模块。

```text
draw-and-guess/
├── .github/workflows/
│   └── windows-build.yml
├── build/
│   ├── icon.ico
│   └── approved-brand-assets/      # 仅存放获准使用的品牌资产
├── resources/
│   ├── assets/
│   │   └── LICENSES.md             # 逐项资源授权清单
│   ├── sounds/                     # start/correct/skip/tick/time-up/champion
│   ├── animations/                 # 本地 Lottie JSON
│   └── sample-bank.xlsx
├── src/
│   ├── main/
│   │   ├── index.ts                # app / BrowserWindow / lifecycle
│   │   ├── ipc/
│   │   │   ├── game.ipc.ts
│   │   │   ├── questions.ipc.ts
│   │   │   └── system.ipc.ts
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   ├── domain/
│   │   │   ├── game-engine.ts
│   │   │   ├── timer-engine.ts
│   │   │   ├── question-engine.ts
│   │   │   ├── score-engine.ts
│   │   │   └── recovery-service.ts
│   │   └── services/
│   │       ├── excel-service.ts    # ExcelJS: .xlsx import/export
│   │       ├── csv-service.ts      # Papa Parse
│   │       ├── export-service.ts
│   │       └── backup-service.ts
│   ├── preload/
│   │   ├── index.ts                # 受控 contextBridge
│   │   └── game-api.d.ts
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── app/
│   │       │   ├── App.tsx
│   │       │   ├── router.tsx
│   │       │   └── providers.tsx
│   │       ├── pages/
│   │       │   ├── HomePage.tsx
│   │       │   ├── QuestionBankPage.tsx
│   │       │   ├── GameSetupPage.tsx
│   │       │   ├── GameReadyPage.tsx
│   │       │   ├── GamePlayPage.tsx
│   │       │   ├── TurnResultPage.tsx
│   │       │   ├── FinalResultPage.tsx
│   │       │   ├── HistoryListPage.tsx
│   │       │   ├── HistoryDetailPage.tsx
│   │       │   └── SettingsPage.tsx
│   │       ├── components/
│   │       │   ├── ui/             # shadcn/ui 生成组件
│   │       │   ├── TeamCountStepper.tsx
│   │       │   ├── TeamEditor.tsx
│   │       │   ├── TeamScoreStrip.tsx
│   │       │   ├── QuestionDisplay.tsx
│   │       │   ├── CountdownRing.tsx
│   │       │   ├── GameActionBar.tsx
│   │       │   ├── ConfettiLayer.tsx
│   │       │   ├── TrophyCelebration.tsx
│   │       │   └── RankReveal.tsx
│   │       ├── hooks/
│   │       │   ├── useGameSnapshot.ts
│   │       │   ├── useTurnClock.ts
│   │       │   ├── useGameHotkeys.ts
│   │       │   ├── useGameEffects.ts
│   │       │   └── useGameAudio.ts
│   │       ├── store/
│   │       │   ├── ui-store.ts     # Zustand: 非权威 UI 状态
│   │       │   └── setup-store.ts  # 设置草稿
│   │       ├── styles/
│   │       │   ├── tokens.css
│   │       │   └── globals.css
│   │       └── main.tsx
│   └── shared/
│       ├── types/
│       ├── schemas/
│       └── constants/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── renderer/                   # React Testing Library
│   └── e2e/                        # Playwright Electron
├── electron.vite.config.ts
├── electron-builder.yml
├── components.json                  # shadcn/ui 配置
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

### 10.1 初始化与开发命令（示例）

先按 `electron-vite` React + TypeScript 模板初始化，再配置 `@vitejs/plugin-react`、Tailwind 4 与 `shadcn/ui`。不要在 `electron-vite` 项目根目录直接套用会覆盖 Main/Preload 配置的普通 Vite 模板；只向 Renderer 引入 React 插件和样式。

```bash
# 已有 electron-vite + React + TypeScript 项目后
pnpm add react react-dom react-router-dom zustand zod
pnpm add tailwindcss @tailwindcss/vite lucide-react
pnpm add react-countdown-circle-timer canvas-confetti lottie-react motion react-countup use-sound
pnpm add exceljs papaparse better-sqlite3
pnpm add -D @types/react @types/react-dom @types/canvas-confetti @types/howler @types/papaparse
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom

# 配置 Tailwind + @ 别名后（以 CLI 实际版本提示为准）
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog input select table tabs tooltip
```

> 这里只列出业务依赖示例；`electron`、`electron-vite`、`@vitejs/plugin-react`、`electron-builder`、TypeScript、Playwright 的安装由项目脚手架/开发依赖阶段完成。`shadcn/ui` 组件不等于安装一个运行时黑盒库；应将生成的 TSX 纳入版本管理。对 `use-sound`、ExcelJS、electron-vite 的版本兼容性要做 smoke test，不能仅凭安装成功认定打包可用。

`package.json` 推荐脚本：

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:ui": "vitest run tests/renderer",
    "test:e2e": "playwright test",
    "dist:win": "electron-vite build && electron-builder --win nsis --x64",
    "dist:portable": "electron-vite build && electron-builder --win portable --x64",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

该脚本为项目骨架建议，不宣称已在本次修改中执行或打包；Windows x64 的 Node 原生模块和音效/动画文件的 packaged path 必须实测。

### 10.2 Windows 打包目标

- **安装版**：`DrawAndGuess-1.0.0-Setup.exe`（NSIS，默认按用户安装）。
- **便携版**：`DrawAndGuess-1.0.0-Portable.exe`；若无明确 U 盘随身数据需求，默认与安装版一样将 SQLite 放在用户数据目录，避免写入无权限目录。
- **调试产物**：unpacked 目录，便于 Windows 问题定位。
- 推荐 Windows x64 Runner/真机产生最终包，Mac 负责日常开发及逻辑测试。
- 确保 `resources/sounds`、`resources/animations`、`resources/assets/LICENSES.md`、获批 Logo 与字体可在安装包内定位；不能使用 Renderer 源码目录的开发绝对路径。
- Native `better-sqlite3` 按 Electron ABI 重建并配置 `asarUnpack`；配置 `extraResources` 或适用的静态资源引入策略，再验证离线访问。
- 内部分发需要考虑公司 IT 白名单/签名/Defender/SmartScreen；未签名软件在企业设备上可能被禁止运行。
- Electron 自带 Chromium/Node，不是几十 KB 的单文件 HTML；NSIS/Portable 交付以 Windows `.exe` 为目标。

---

## 11. 非功能要求

### 11.1 性能

- 普通办公 Windows 电脑冷启动目标 ≤5 秒（目标值，需实测）。
- 操作反馈目标 ≤150ms；判定到下一题切换主观感知流畅。
- 2,000 道题库导入不阻塞游戏主循环；大文件导入应显示进度/忙碌态。
- 1080p 下计时/题目刷新稳定，避免整页重渲染导致卡顿。

### 11.2 可靠性

- SQLite 事务保障计分、日志和题目占用一致。
- 崩溃/关机后必须存在最后已提交的赛事数据；恢复以暂停状态进行。
- 文件选择对话框取消不修改当前题库。
- 备份/恢复前后执行完整性检查。
- UI 无响应、异常文件、磁盘空间不足都应提供可理解的错误。

### 11.3 安全与合规

- 所有题库、队名和比赛历史仅存本地；默认不联网、不上传。
- Electron 仅加载应用本地可信页面；禁止渲染进程直接访问 Node/文件系统。
- IPC 严格白名单和输入校验，记录关键错误但不输出无关敏感系统路径。
- 导入 Excel 不执行宏、不执行公式、不加载远程链接。
- 品牌 Logo、字体与视觉资产使用必须得到内部许可；开发仓库不提交未经授权的公司内部资产。

### 11.4 本地化

- V1 默认简体中文，关键状态可辅以 `ROUND / TIME UP / Genpact-draw&guess` 英文。
- Windows 日期时间显示本地时区；数据库以 ISO UTC 时间或 Unix 毫秒时间戳存储，展示时转换本地时间。

---

## 12. 质量保证与验收用例

### 12.1 P0 自动化验收用例（扩展版）

**原则**：游戏规则由 Main 进程集成测试验证，不仅依赖 Renderer 按钮测试；数据库不变量、边界时刻、断电恢复、IPC 乱序必须覆盖。所有测试在全新数据库和已有历史数据库分别运行。

| 编号 | 用例 | 必须通过的断言 |
|---|---|---|
| AC-01 | 设置 5 队 × 3 轮 | 按顺序预生成 15 次挑战，首个 `TURN_READY`、其余 `TURN_PENDING` |
| AC-02 | 队伍数 4→7→4→7 | 输入名称缓存恢复；队伍顺序和数字范围正确 |
| AC-03 | Excel 两行相同规范化题目 | 仅一份规范化实体，报告重复 |
| AC-04 | A 队答对 X，B 队/下一轮继续 | X 不被第二次首次分配 |
| AC-05 | A 队跳过 Y | Y 不被第二次首次分配 |
| AC-06 | 60 秒内答对 5 道 | 不重置倒计时、积分与日志匹配 |
| AC-07 | 0 秒连续按 Enter | Main 拒绝判题、超时结算仅一次、无越界加分 |
| AC-08 | A 队结算后 | B 队必须经“下一队准备→开始”才计时 |
| AC-09 | Space 暂停 30 秒再恢复 | 暂停期间不扣秒，当前题和积分不丢 |
| AC-10 | 已分配题 Q1 后强制关闭 | RUNNING→PAUSED；隐藏 Q1，继续时换题 |
| AC-11 | 双击答对/重复 commandId/不同 commandId 旧题 | 每题恰好一个有效判定、只加一次分 |
| AC-12 | 题库耗尽且存在后续挑战 | 当前 `TURN_EXHAUSTED`、剩余 `TURN_NOT_PLAYED`、`GAME_FINISHED_EARLY`，没有冠军 |
| AC-13 | 错误 Excel / 取消导入 | 当前库数据与队列快照均不被破坏 |
| AC-14 | 正常完成比赛并重开 | `GAME_FINISHED`，历史完整、正式名次正确 |
| AC-15 | 成绩 Excel 导出 | 包含比赛状态、队伍/逐题/未进行/作废/成绩修正各 Sheet，汇总一致 |
| AC-16 | 在线备份、修改后恢复 | 当前库自动备份、恢复一致、迁移版本可读 |
| AC-17 | 12 队、1366×768 投影 | 当前题/计时/按钮可见，所有队分数可查看 |
| AC-18 | Windows 11 x64 安装包完全离线启动 | 无 Node/Python/外部服务依赖 |
| AC-19 | Setup 和 Portable 分别重启 | 数据目录行为与说明一致，历史可恢复 |
| AC-20 | RUNNING 异常退出 | 主进程使用最近检查点恢复 PAUSED，无自动计时/声音 |
| AC-21 | **创建时可用题目 0** | 阻止 `games.create`；且不可启动无题旧比赛 |
| AC-22 | **最后一题提前答对** | 只计分一次，不抽旧题，立刻 `TURN_EXHAUSTED` + `GAME_FINISHED_EARLY`（即使是最后一场） |
| AC-23 | **最后一题恰逢时间归零** | 超时优先；不额外加分；若全部计划挑战完成则 `GAME_FINISHED` |
| AC-24 | **答对 Q1 后系统展示 Q2，立即撤销** | Q1→`VOIDED`，Q2 仍为唯一 CURRENT，积分抵销且时间不回退 |
| AC-25 | **撤销后判定 Q2** | 只从从未用过的题中分配 Q3，Q1 始终 VOIDED，历史含全部事件 |
| AC-26 | **撤销后应用强制退出，再打开** | 恢复 PAUSED，隐藏 Q2，Q1 仍 VOIDED，继续时换题 |
| AC-27 | **撤销过早/已结算/后续题已判定** | 拒绝不合法撤销，建议人工成绩修正；数据不变 |
| AC-28 | **READY 状态强制退出** | 返回 P04，不抢先抽题或开始计时 |
| AC-29 | **PAUSED 状态强制退出** | 仍 PAUSED，剩余时长和当前题一致 |
| AC-30 | **单队结算页强制退出** | 回到 P06，必须人工确认进入下一队 |
| AC-31 | **人工修正指定终态 turn_id** | 单轮分、总分、排名与导出同时更新，记录所有旧值新值；运行/暂停中的挑战不可修分 |
| AC-32 | **队伍级额外修正且 turn_id=NULL** | 只改变队伍总分，不篡改单轮分；排名与导出一致 |
| AC-33 | **已完成比赛修正成绩** | 游戏终态不改变，排名即时重算且审计保留 |
| AC-34 | **导出当前题库** | `.xlsx` 可重新导入，题目、类别、难度、分值、启停状态一致 |
| AC-35 | **赛中导入其他题库/改原题** | 已创建比赛仍使用固定快照，不能追加、刷新或重排队列 |
| AC-36 | **比赛中主动中止** | 二次确认、所有未开始挑战标记原因、当前题不回池，历史可导出但无冠军 |
| AC-37 | **数据库人工制造两个 CURRENT / 错误指针** | 恢复进入 `RECOVERY_REQUIRED`，禁止自动计分，显示安全备份/诊断 |
| AC-38 | **耗尽后导出** | `FINISHED_EARLY`、未参赛队、计划/完成挑战数、作废题均可查询且准确 |
| AC-39 | **React 页面与多队配置** | React 19 + shadcn/ui 下 2→12→2 队输入缓存、键盘焦点和全屏页面均正常；没有 Vue 运行依赖 |
| AC-40 | **权威时钟与圆环同步** | `react-countdown-circle-timer` 暂停/恢复/切队/恢复存档仅展示 Main 剩余值；组件 `onComplete` 不能单独结算或加分 |
| AC-41 | **重复提交与视觉副作用** | 同一 `eventId`、重复 commandId、stale 题和已超时请求不会重复撒花、播放答对音或滚动错误分数 |
| AC-42 | **音效离线与静音** | 本地资源打包可播放，音量/静音即时生效；最后 10 秒同一秒不重播；音频加载失败不影响游戏 |
| AC-43 | **动画降级和减少动态效果** | 关闭动画/系统 `prefers-reduced-motion` 时撒花、Lottie、Motion、CountUp 降级，不影响判题、计时、排名 |
| AC-44 | **冠军资格判定** | 唯一冠军只在 `GAME_FINISHED` 播放庆祝；并列第一、提前结束、中止不得出现独占冠军动画或胜利音 |
| AC-45 | **素材版权与离线清单** | 每个内置音频/Lottie 均有源 URL、许可证和本地授权记录；无 CDN 请求，无未知许可素材 |
| AC-46 | **Windows 打包资源与 React E2E** | Windows 11 Setup/Portable 均能从包内离线载入 ExcelJS、音效、Lottie；没有 Vue/Pinia 残留，React Testing Library 与 Electron E2E 通过 |

### 12.2 Windows 最终人工验收

**发布门禁：Windows 11 x64**：

- 真机首次安装、二次启动、窗口/全屏切换、Alt+Tab、外接投影、系统缩放 100%/125%/150%。
- 使用中文路径及中文 Excel 文件名测试导入、题库导出、成绩导出、备份。
- 强制结束进程、整机重新启动、SQLite 写入失败、磁盘空间不足情况下提示正确，不损坏已经提交的日志。
- 1366×768、1920×1080；长题 20–80 字不遮挡计时和按钮。
- 验证 Defender/SmartScreen/企业终端白名单、无网络、无管理员权限、普通办公账户；检查本地 `resources/sounds` 与 Lottie JSON 的离线访问，网断时不产生素材 CDN 请求。
- Windows 10 x64 如有测试设备可进行**兼容性探索**；不在 v1 强制发布门禁中。若未来要宣称正式支持，需另加 Windows 10 测试矩阵与签核。

### 12.3 必须满足的数据库不变量

1. 同一 Game 下 `CURRENT` 题目最多 1 道；运行/暂停挑战的当前指针必须与它一致。
2. 所有 `JUDGED` 题目都有有效 `verdict`，`VOIDED` 题目永不再分配；同一规范化题目最多首次分配一次。
3. `UNUSED` 题目从未有 `shown_turn_id` / `first_allocated_at`；已用题这两个字段不可清除。
4. 各挑战分 = 有效答题积分 + 挑战级修正；队伍分 = 挑战分合计 + 队伍级修正。
5. 终态比赛无可继续的 RUNNING/PAUSED/READY 挑战；耗尽时所有未开始挑战均为 `TURN_NOT_PLAYED`。
6. 相同 `command_id` 及对旧题的 stale command 不产生第二次修改；意外重启不产生新的随机队列。
7. 任何题目的历史展示/计分都来自创建比赛时的快照，不从被编辑的题库反向补数据。

## 13. 分阶段开发计划（适合按 Feature / Spec Kit 拆分）

| 里程碑 | Feature | 交付内容 | 退出门槛 |
|---|---|---|---|
| M0 | `F-00-foundation` | **Electron + React 19 + TypeScript + React Router + Zustand + Tailwind 4 + shadcn/ui**、主/预加载进程、安全框架、品牌 Tokens、页面骨架 | Windows 开发窗口正常显示、基础 IPC 安全测试与 React 组件烟测通过 |
| M1 | `F-01-question-bank` | SQLite 迁移、Excel/CSV 导入/导出、规范化去重、题库列表与预览 | AC-03、AC-13、AC-34 及导入边界通过 |
| M2 | `F-02-game-setup` | 手动队伍数量、队名/颜色、轮次、时间、队伍排程 | 2–12 队及轮次组合正确 |
| M3 | `F-03-live-game` | **两层状态机、当前题指针、耗尽、撤销/作废、主进程权威计时、React `useTurnClock` + 圆环、答对/跳过、切队及中止** | AC-04～12、AC-21～27、AC-35～37、AC-40、数据库不变量通过；不得缺规则先编码 |
| M4 | `F-04-history-results` | 正常/提前结束/中止结果、排行榜、历史、逐题事件、双粒度修正 | AC-14、AC-31～33、AC-38 通过，分数重算一致 |
| M5 | `F-05-recovery-export` | **全部状态恢复矩阵**、Excel 成绩导出、数据库一致性备份/恢复 | AC-10、AC-15～16、AC-20、AC-26、AC-28～30、AC-37 通过 |
| M6 | `F-06-effects-windows-release` | **use-sound、canvas-confetti、lottie-react、motion、react-countup**、减少动态效果、版权清单、全屏与 Windows Installer/Portable | AC-39～46、Windows 11 真机与完整离线验收通过 |

**建议顺序**：`Foundation → 数据模型/题库 → 多队配置 → 游戏状态机 → 记录/恢复 → Windows 验收`。  
不要先做复杂动画/粒子特效再补计时及数据一致性。React 动效和音效依赖可以规划在 V1，但**在 F-03 业务状态机/时钟测试稳定后**再集中接入。

### 13.1 进入开发前立即落实的决定

1. 获取 Genpact 最新获批 Logo、品牌色板、字体使用说明（如果没有，按公开参考版先做可替换主题）。
2. 确认公司 Windows 设备的安装权限、杀毒及可执行文件签名要求。
3. 选择 Windows 11 x64 为首个硬验收平台。
4. 建立单仓库、提交 `.gitignore`、代码风格与 lockfile。
5. 建立 `F-00` Spec、测试计划与基础架构，不直接进行无约束堆代码。
6. 尽快在 Windows 构建一次空壳安装包，提前暴露 SQLite 原生模块、签名和企业安全策略问题。

### 13.2 V1 发布门禁

- [ ] P0 功能全部实现并与本文规则一致。
- [ ] 双状态机、当前题唯一、全局分配去重、耗尽终态、撤销作废、倒计时终止、事务计分单测和集成测试通过。
- [ ] 至少完成一次 `12 队 × 3 轮` 的端到端模拟。
- [ ] 完成真实 Windows 电脑离线安装、打开、导入、计时、结算、导出。
- [ ] 完成 READY/RUNNING/PAUSED/单队结算/终态各恢复矩阵及撤销后异常恢复测试。
- [ ] 完成安装版、便携版数据目录行为验证；音效和 Lottie/品牌文件真实打入安装包并在断网下可加载。
- [ ] 获得当前品牌方案内部视觉确认（Logo/字体/配色），且所有外部音效/Lottie 具备逐项授权清单。
- [ ] 生成使用说明、安装说明、题库模板、题库导出样本、成绩导出样本、版本更新说明。
- [ ] `AC-01`～`AC-46` 全部通过，含业务状态、修分重排行、React 展示/音效去重、素材许可和 Windows 资源验证。
- [ ] Windows 11 x64 真机通过；Windows 10 仅尽力兼容，不作为本版本发布阻断。

---

## 14. 建议的首个开发 Prompt（React 版，可直接交给编码 Agent）

> 在一个新的 Git 仓库中实现 `F-00-foundation`。项目必须采用 **Electron + electron-vite + React 19 + TypeScript + React Router + Zustand + Tailwind CSS 4 + shadcn/ui + lucide-react**，最终针对 Windows 11 x64 离线运行与打包。明确区分 Main、Preload 和 Renderer；开启 `contextIsolation`、`sandbox`、禁用 `nodeIntegration`；在 `src/shared` 定义 Zod DTO，并通过 Preload 只暴露白名单 `window.gameAPI`。建立 P01 首页、P02 题库、P03 比赛设置、P05 游戏大屏的 React/TSX 静态路由骨架和可替换的 Genpact 候选 Design Tokens；首次优先完成 shadcn/ui 表单/弹窗与大屏自定义样式，不假定网络可用。规划 `react-countdown-circle-timer`、`canvas-confetti`、`lottie-react`、`motion`、`react-countup`、`use-sound` 未来接入的组件和本地资源目录，但**本阶段不让这些库拥有计时和业务状态权威，也不先做复杂特效**。提供 Windows x64 的 electron-builder NSIS/Portable 构建配置及必要原生模块验证方案。补齐 Vitest + React Testing Library 基础测试、环境与构建脚本、README、初始资源授权清单，并完成开发窗口与空壳安装包 smoke test。不引入 Vue、Pinia、后端或在线服务。

> 后续按 `F-01 → F-02 → F-03 → F-04 → F-05 → F-06` 实施。每个 Feature 执行 `spec → plan → tasks → analysis → implement → validation`；v1.1 的游戏规则、7.1/7.2 状态与恢复矩阵、8.2 数据不变量继续具有最高约束力；v1.2 的 React/动效和素材合规要求补充为 `AC-39～AC-46`。

---

## 15. 官方/项目技术资料（开发时查阅）

- Genpact 2025 品牌更新公告：<https://media.genpact.com/2025-09-08-Genpact-Marks-Next-Phase-as-Advanced-Technology-Company-with-Global-Rebrand>
- Genpact 与 Adobe 品牌案例：<https://business.adobe.com/customer-success-stories/genpact.html>
- 公开 Genpact Brand Playbook v0.5（用于对照而非认定最新版）：<https://cdn.vev.design/private/qBnShO4mBVUmjCGjZ328c5cl6zy2/1dbcdu-genpact-playbook-v-0-5.pdf>
- Electron 安全规范：<https://www.electronjs.org/docs/latest/tutorial/security/>
- Electron Context Isolation：<https://www.electronjs.org/docs/latest/tutorial/context-isolation>
- Electron Native Modules：<https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules>
- Electron `app.getPath`：<https://www.electronjs.org/docs/latest/api/app>
- electron-vite 官方文档：<https://electron-vite.org/guide/>
- electron-builder：<https://www.electron.build/docs/>
- electron-builder NSIS：<https://www.electron.build/docs/nsis/>
- Playwright Electron：<https://playwright.dev/docs/api/class-electronapplication>
- React 官方文档：<https://react.dev/>
- React Router：<https://reactrouter.com/>
- Zustand：<https://zustand.docs.pmnd.rs/>
- shadcn/ui（Vite）：<https://ui.shadcn.com/docs/installation/vite>
- React Countdown Circle Timer：<https://www.npmjs.com/package/react-countdown-circle-timer>
- canvas-confetti：<https://www.npmjs.com/package/canvas-confetti>
- Lottie React：<https://www.npmjs.com/package/lottie-react>
- Motion for React：<https://motion.dev/docs/react-installation>
- React CountUp：<https://www.npmjs.com/package/react-countup>
- use-sound（基于 howler.js）：<https://github.com/joshwcomeau/use-sound>
- ExcelJS：<https://www.npmjs.com/package/exceljs>
- Kenney 授权：<https://kenney.nl/support>
- Pixabay Content License：<https://pixabay.com/service/license-summary/>
- Mixkit SFX License：<https://mixkit.co/license/modal/sfxFree/>
- LottieFiles Simple License：<https://lottiefiles.com/page/license>
- LottieFiles 服务条款：<https://lottiefiles.com/page/terms-and-conditions>

---

## 16. v1.1 审查修订记录（相对 v1.0-draft）

| 审查问题 | 规范修订位置 | 处理结果 |
|---|---|---|
| 赛中题库可变冲突 | 0.2 / 2.4 / Q-10 / T-07 | V1 创建即冻结；赛中追加转 P1，当前不支持 |
| 题库耗尽无全场结束语义 | 2.4 / 7.1 / 8.2 / 12.1 | `TURN_EXHAUSTED`、`TURN_NOT_PLAYED`、`GAME_FINISHED_EARLY` 与导出语义 |
| 撤销破坏题目唯一性 | 2.5 / 7.4 / 8.2 / AC-24～27 | 下一题 `VOIDED` 且仍消耗；原题恢复 CURRENT，指针唯一 |
| 状态与页面混合 | 7.1 / 7.2 / 4.9 | GameState、TurnState 分离；归档独立；覆盖所有恢复状态 |
| 人工修分无旧/新值与轮次 | 8.1 / 8.3 / 9.3 / AC-31～33 | `turn_id` 可空、前后分数字段和一致性排名计算 |
| 题库导出缺实现链路 | Q-11 / 6.4 / 9.2 / AC-34 | 增加 `exportBank` IPC、`.xlsx` 格式、可回读验证 |
| Windows 10 支持承诺不一致 | 文档头 / 12.2 / 13.2 | Windows 11 正式发布门禁，Windows 10 尽力兼容 |
| 关键验收覆盖不足 | 12.1～12.3 | AC-01～AC-38 + 数据库不变量 + Windows 真机验收 |

---

## 17. v1.2 React / 视觉音效修订记录（相对 v1.1）

| 改动主题 | 变更范围 | 与 v1.1 业务规则的关系 |
|---|---|---|
| Vue → React 19 | §6、§10、§13、§14、最终概述 | 不改变已冻结玩法和数据库事务语义 |
| Vue Router / Pinia → React Router / Zustand | §6.1、§6.3、§6.5、§10 | Zustand 非事实来源，Main 仍唯一权威 |
| Reka UI / lucide-vue → shadcn/ui / lucide-react | §5、§6、§10 | 品牌色仍需内部批准 |
| 圆环倒计时 | G-14、§6.5、AC-40 | `onComplete` 不得终结挑战；Main 权威时钟 |
| 视觉与分数动效 | G-15/16、§4、§5、§6.6、AC-41/43/44 | 特效发生在已提交状态之后，不得错误授冠军 |
| 本地音效 | G-11、§6.6、AC-42 | use-sound/howler.js、静音、幂等防重复 |
| ExcelJS | §6.1、§6.2、§10 | Main 解析 `.xlsx`；Papa Parse 处理 CSV；避开 npm 旧 `xlsx` 已知问题，保留原题库导出契约 |
| 素材许可证 | §6.7、§10、AC-45/46 | 逐文件许可；公司品牌资产仍需获批 |
| 测试与交付 | §12、§13、§14 | 追加 AC-39～AC-46，总计 46 项 |

**版本优先级**：原 v1.1 的玩法/状态机/数据库/恢复规则全部保留；与技术栈、React 组件、音效和动画相关的冲突以 v1.2 为准。该规格是**待实现开发基线**，不代表组件、Windows 打包与素材已经完成验收。

---

## 18. 最终定版一句话

**采用经确认可替换的 Genpact 品牌视觉，以 Electron + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + SQLite 实现可离线运行的 Windows 单体桌面团建程序：支持 2–12 支队伍轮流限时挑战、大屏公开题目、全场首次分配去重、精确权威计时、可审计的撤销和成绩修正、题库耗尽提前结束、历史记录及 Excel 导入导出，并通过本地圆环、音效、撒花、Lottie 与排名动画增强现场体验而不破坏业务一致性。**
