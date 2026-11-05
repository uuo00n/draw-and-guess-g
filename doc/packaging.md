# 打包说明

本文说明如何把「你画我猜」打成 Windows 与 macOS 安装包。配置以仓库根目录的 `package.json` 和 `electron-builder.yml` 为准。

当前版本 **1.1.0**。运行时是 Electron **44.10.2**（内置 Node 24.22.2，`NODE_MODULE_VERSION` 149）。打包工具是 electron-builder。包管理器只用 npm，锁文件是 `package-lock.json`。

## 1. 发布边界

| 平台 | 在哪台机器上打包 | 正式产物 | 能不能当作发布通过 |
|---|---|---|---|
| Windows x64 | Windows x64 | NSIS `Setup.exe`、`Portable.exe` | 可以。还须在 Windows 11 x64 上离线实机验收 |
| macOS | macOS（与目标芯片一致） | `.dmg`、`.zip` | 可以用于 macOS 分发。当前配置未签名、未公证 |
| 在 macOS 上打 Windows 包 | 不采用 | 无 | 不能。交叉打包不能代替 Windows 发布 |

正式支持与发布门禁是 **Windows 11 x64**。Windows 10 x64 只做尽力兼容。macOS 包给开发和 macOS 使用，不替代 Windows 验收。

不要开启自动更新，也不要在发布配置里留下 `publish.provider: generic`。

## 2. 环境

构建机安装：

- Node.js 22（与 `.github/workflows/windows-build.yml` 一致）
- npm
- Git

原生模块 `better-sqlite3` 要按 Electron ABI 重建。预编译包不可用时：

- Windows：安装 Visual Studio Build Tools，勾选「使用 C++ 的桌面开发」
- macOS：安装 Xcode Command Line Tools（`xcode-select --install`）

在仓库根目录执行后续命令。

## 3. 打包前的共同步骤

```bash
npm ci
npx electron-builder install-app-deps
npm run typecheck
npm test
```

`npm ci` 会触发 `postinstall`，其中已经包含 `electron-builder install-app-deps`。上面再显式执行一次，是为了确认 `better-sqlite3` 的 `.node` 对应当前 Electron，而不是系统 Node。

`electron-builder.yml` 把该原生文件排除出 asar：

```yaml
asarUnpack:
  - resources/**
  - "**/node_modules/better-sqlite3/**/*.node"
  - "**/*.node"
```

`npmRebuild` 为 `false`，所以不要指望 electron-builder 在打包阶段自动重编原生模块。

图标已经放在 `build/`：

| 文件 | 用途 |
|---|---|
| `build/icon.ico` | Windows |
| `build/icon.icns` | macOS |
| `build/icon.png` | 通用源图 |

## 4. Windows

在 **Windows x64** 上执行。`build:win` 会先做类型检查和 `electron-vite build`，再打 NSIS 与 Portable，架构固定为 x64。

```bash
npm run build:win
```

等价于：

```bash
npm run build && electron-builder --win nsis portable --x64
```

产物在 `dist/`：

| 文件 | 说明 |
|---|---|
| `你画我猜-1.1.0-win-x64-Setup.exe` | NSIS 安装包。创建桌面快捷方式，显示名称为「你画我猜」 |
| `你画我猜-1.1.0-win-x64-Portable.exe` | 免安装包。数据库仍在用户数据目录，不跟 exe 放在一起 |

版本号来自 `package.json` 的 `version`。升级版本后，文件名中的 `1.1.0` 会跟着变。

只看未打包目录、便于排查原生模块时：

```bash
npm run build:unpack
```

### Windows 持续集成

`.github/workflows/windows-build.yml` 在 `windows-latest` 上、由推送到 `master` 或手动触发。步骤是 `npm ci`、重建 `better-sqlite3`、类型检查、测试、`npm run build:win`，再上传这两个 exe。

### Windows 验收

在一台不依赖开发依赖的 Windows 11 x64 上分别运行 Setup 与 Portable，确认：

- 断网可以启动，题库导入、比赛、历史都能完成
- `better-sqlite3` 能打开数据库，没有 `NODE_MODULE_VERSION` 不匹配
- 音效、Lottie 和许可证清单从安装包内加载，不访问外网

安装包未签名。SmartScreen 或企业白名单可能拦截。这是发布条件，不能靠改业务规则绕过。需要公司签名或把文件加入允许列表。

## 5. macOS

在 **macOS** 上执行。先完成第 3 节，再打包。`build:mac` 本身不做类型检查，所以类型检查和测试要先跑完。

```bash
npm run build:mac
```

等价于：

```bash
electron-vite build && electron-builder --mac
```

`electron-builder.yml` 没有写死 `mac.target`，electron-builder 默认打出 **dmg** 和 **zip**。架构跟构建机一致：Apple 芯片是 arm64，Intel 是 x64。

产物在 `dist/`：

| 文件 | 说明 |
|---|---|
| `draw-and-guess-1.1.0.dmg` | 磁盘映像，里面是「你画我猜.app」 |
| `draw-and-guess-1.1.0-mac.zip` | 同一应用的 zip。后缀里的架构名以当次 electron-builder 输出为准 |

dmg 文件名用的是包名 `name`（`draw-and-guess`），窗口里显示的应用名仍是 `productName`（你画我猜）。

需要指定架构时，在 `npm run build` 之后执行：

```bash
# 仅 Apple 芯片
npx electron-builder --mac --arm64

# 仅 Intel
npx electron-builder --mac --x64
```

两种芯片都要覆盖时，在对应的 Mac 上各打一次。`--universal` 会把 arm64 与 x64 合成一个包，但 `better-sqlite3` 必须两侧都有匹配 Electron ABI 的 `.node`。通用包没有在本机验证通过之前，不要把它当作可分发产物。

### macOS 签名与首次打开

当前配置：

- `mac.notarize` 为 `false`，不会提交 Apple 公证
- 继承权限文件是 `build/entitlements.mac.plist`（JIT、未签名可执行内存、dyld 环境变量）
- 没有配置 Developer ID

未签名、未公证的应用在其他 Mac 上会被 Gatekeeper 拦截。内部分发时由接收方在「访达」里右键应用，选择「打开」，再确认一次。这只适用于受控的内部机器。对外分发需要 Apple Developer ID、Hardened Runtime 签名和公证，那是另一套发布流程，本文的命令不包含它。

## 6. 数据目录

数据库路径固定为：

```text
app.getPath('userData')/data/draw-and-guess.db
```

按当前产品名，通常是：

| 系统 | 路径 |
|---|---|
| Windows | `%APPDATA%\你画我猜\data\draw-and-guess.db` |
| macOS | `~/Library/Application Support/你画我猜/data/draw-and-guess.db` |

Setup、Portable 和 macOS 的 `.app` 都使用这个位置。卸载或更换 exe 不会把数据库带在安装目录里。备份走应用内的 better-sqlite3 backup，不要手拷一个正在写入的 db 文件当作唯一备份。

## 7. 打包后检查

1. `dist/` 里有本节对应平台的安装包，文件名里的版本与 `package.json` 一致。
2. 安装或打开后能进入首页，不出现原生模块加载失败。
3. 新建一场比赛后，上面的数据库文件出现，重启应用后历史还在。
4. 断开网络再走一遍导入题库和主持流程。
5. Windows 正式发布只认 Windows 上打出的包，并完成 Windows 11 x64 实机验收。
