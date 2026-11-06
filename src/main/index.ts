import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, nativeImage, powerSaveBlocker } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_DISPLAY_NAME, APP_WINDOW_TITLE } from '../shared/constants'
import icon from '../../resources/icon.png?asset'
import type { AppDatabase } from './database/connection'
import { checkpointRunning, pauseRunningForExit, recoverDatabase } from './domain/game-engine'
import { timerEngine } from './domain/timer-engine'

const isGameFlowTest = process.env.E2E_GAME_FLOW === '1'
let userData = process.env.E2E_USER_DATA || ''
let db: AppDatabase | null = null
let checkpointInterval: ReturnType<typeof setInterval> | undefined
let sleepBlocker: number | undefined
let quitRequested = false

function applyAppIcon(): void {
  const image = nativeImage.createFromPath(icon)
  if (image.isEmpty()) return
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(image)
  }
}

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#161916',
    autoHideMenuBar: true,
    title: APP_WINDOW_TITLE,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  let closePending = false
  let closeApproved = false
  mainWindow.on('close', (event) => {
    if (closeApproved || !db) return
    if (closePending) {
      event.preventDefault()
      return
    }

    try {
      const active = db
        .prepare(`SELECT 1 FROM games WHERE status IN ('GAME_READY', 'GAME_ACTIVE') LIMIT 1`)
        .get()
      if (!active) return
    } catch (error) {
      event.preventDefault()
      quitRequested = false
      reportExitFailure(error)
      return
    }

    event.preventDefault()
    closePending = true
    void dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['暂停并退出', '继续比赛'],
        defaultId: 1,
        cancelId: 1,
        message: '比赛尚未结束',
        detail: '退出前会保存倒计时和已提交的分数。继续暂停的挑战时会换一道新题。'
      })
      .then(({ response }) => {
        if (response !== 0 || !db) {
          quitRequested = false
          return
        }
        pauseRunningForExit(db, timerEngine, performance.now())
        closeApproved = true
        if (quitRequested) app.quit()
        else mainWindow.close()
      })
      .catch((error) => {
        quitRequested = false
        reportExitFailure(error)
      })
      .finally(() => {
        closePending = false
      })
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(1)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function reportExitFailure(error: unknown): void {
  console.error('Failed to save games before exit:', error)
  dialog.showErrorBox('暂时无法退出', '保存比赛时出错。窗口将保持打开，请重试。')
}

function releaseResources(): void {
  clearInterval(checkpointInterval)
  if (sleepBlocker !== undefined && powerSaveBlocker.isStarted(sleepBlocker)) {
    powerSaveBlocker.stop(sleepBlocker)
  }
  timerEngine.disarmAll()
  db?.close()
  db = null
}

function failStartup(error: unknown): void {
  console.error('Application startup failed:', error)
  if (userData) {
    try {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error)
      appendFileSync(join(userData, 'startup-error.log'), `${new Date().toISOString()} ${detail}\n`)
    } catch (logError) {
      console.error('Unable to write startup log:', logError)
    }
  }
  try {
    releaseResources()
  } catch (cleanupError) {
    console.error('Application cleanup failed:', cleanupError)
  }
  if (!isGameFlowTest) {
    dialog.showErrorBox(
      `${APP_DISPLAY_NAME} 启动失败`,
      `无法启动应用。请检查数据目录是否可读写，或将 startup-error.log 提供给维护人员。

数据目录：${userData || '无法确定'}`
    )
  }
  app.exit(1)
}

function startApplication(): void {
  app.setName(APP_DISPLAY_NAME)
  userData ||= join(app.getPath('appData'), '你画我猜')
  mkdirSync(userData, { recursive: true })
  app.setPath('userData', userData)
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return
  }

  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      if (db && !isGameFlowTest) void createWindow().catch(failStartup)
      return
    }
    if (!window.isVisible() && !window.isMinimized()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app.on('before-quit', () => {
    quitRequested = true
  })
  app.on('will-quit', releaseResources)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.genpact.draw-and-guess')
    applyAppIcon()
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window, { zoom: true })
    })

    const { openDatabase } = await import('./database/connection')
    const {
      initDatabasePath,
      registerQuestionHandlers,
      registerGameHandlers,
      registerAppHandlers
    } = await import('./ipc/register-handlers')
    const initPaths = initDatabasePath()
    db = openDatabase(initPaths.dbPath)
    const { ensureBundledQuestionBank } = await import('./services/bundled-question-bank')
    await ensureBundledQuestionBank(db)
    recoverDatabase(db, timerEngine)
    registerQuestionHandlers(db)
    registerGameHandlers(db, { dataDir: initPaths.dataDir })
    registerAppHandlers(db, { ...initPaths, timer: timerEngine })

    if (isGameFlowTest) {
      const { runElectronGameFlow } = await import('./e2e-game-flow')
      const result = runElectronGameFlow(db)
      writeFileSync(
        process.env.E2E_RESULT_PATH ?? join(app.getPath('temp'), 'e2e-game-flow.json'),
        JSON.stringify(result, null, 2)
      )
      releaseResources()
      app.exit(result.ok ? 0 : 1)
      return
    }

    await createWindow()
    checkpointInterval = setInterval(() => {
      if (!db) return
      try {
        checkpointRunning(db, timerEngine)
      } catch (error) {
        console.error('Failed to checkpoint games:', error)
      }
      const timing = timerEngine.activeGameIds().length > 0
      if (timing && sleepBlocker === undefined) {
        sleepBlocker = powerSaveBlocker.start('prevent-display-sleep')
      } else if (!timing && sleepBlocker !== undefined) {
        if (powerSaveBlocker.isStarted(sleepBlocker)) powerSaveBlocker.stop(sleepBlocker)
        sleepBlocker = undefined
      }
    }, 1000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch(failStartup)
    })
  }).catch(failStartup)
}

try {
  startApplication()
} catch (error) {
  failStartup(error)
}
