# draw-and-guess

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

Windows 安装包必须在 Windows x64 上构建。`npm run build:win` 会生成：

- `dist/draw-and-guess-1.0.0-win-x64-Setup.exe`
- `dist/draw-and-guess-1.0.0-win-x64-Portable.exe`

构建前先为当前 Electron ABI 重建 `better-sqlite3`：

```bash
npx electron-builder install-app-deps
npm run build:win
```

GitHub Actions 工作流是 `.github/workflows/windows-build.yml`。macOS 上交叉打包不能当作 Windows 发布通过。安装包未签名，可能被 SmartScreen 拦截。

数据库位于 Electron `userData/data/draw-and-guess.db`，不跟 Portable exe 放在同一目录。

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
