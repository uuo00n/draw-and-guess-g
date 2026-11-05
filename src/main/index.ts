import { writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, nativeImage, powerSaveBlocker, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_DISPLAY_NAME, APP_WINDOW_TITLE } from '../shared/constants'
import icon from '../../resources/icon.png?asset'
import { openDatabase } from './database/connection'
import { checkpointRunning, recoverDatabase } from './domain/game-engine'
import { timerEngine } from './domain/timer-engine'
import { runElectronGameFlow } from './e2e-game-flow'
import {
  initDatabasePath,
  registerAppHandlers,
  registerGameHandlers,
  registerQuestionHandlers
} from './ipc/register-handlers'

if (process.env.E2E_USER_DATA) {
  app.setPath('userData', process.env.E2E_USER_DATA)
}

if (process.platform === 'darwin') {
  app.setName(APP_DISPLAY_NAME)
}

function applyAppIcon(): void {
  const image = nativeImage.createFromPath(icon)
  if (image.isEmpty()) return
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(image)
  }
}

let db: ReturnType<typeof openDatabase> | null = null

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

function createWindow(): void {
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

  let quitting = false
  mainWindow.on('close', (event) => {
    if (quitting || !db) return
    const active = db
      .prepare(`SELECT id FROM games WHERE status IN ('GAME_READY', 'GAME_ACTIVE') LIMIT 1`)
      .get()
    if (!active) return
    event.preventDefault()
    void dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['暂停并退出', '继续比赛'],
        defaultId: 1,
        cancelId: 1,
        message: '比赛尚未结束',
        detail: '退出前会暂停正在计时的挑战。已经提交的分数会保留。'
      })
      .then(({ response }) => {
        if (response !== 0 || !db) return
        recoverDatabase(db, timerEngine)
        quitting = true
        mainWindow.close()
      })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const allowed = details.url.startsWith('https://electron-vite.org')
    if (allowed) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.genpact.draw-and-guess')
  applyAppIcon()
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const initPaths = initDatabasePath()
  db = openDatabase(initPaths.dbPath)
  recoverDatabase(db, timerEngine)
  registerQuestionHandlers(db)
  registerGameHandlers(db, { dataDir: initPaths.dataDir })
  registerAppHandlers(db, { dbPath: initPaths.dbPath, dataDir: initPaths.dataDir, timer: timerEngine })

  if (process.env.E2E_GAME_FLOW === '1') {
    const result = runElectronGameFlow(db)
    writeFileSync(
      process.env.E2E_RESULT_PATH ?? join(app.getPath('temp'), 'e2e-game-flow.json'),
      JSON.stringify(result, null, 2)
    )
    app.exit(result.ok ? 0 : 1)
    return
  }

  createWindow()
  let sleepBlocker: number | null = null
  setInterval(() => {
    if (!db) return
    checkpointRunning(db, timerEngine)
    const timing = timerEngine.activeGameIds().length > 0
    if (timing && sleepBlocker == null)
      sleepBlocker = powerSaveBlocker.start('prevent-display-sleep')
    if (!timing && sleepBlocker != null) {
      if (powerSaveBlocker.isStarted(sleepBlocker)) powerSaveBlocker.stop(sleepBlocker)
      sleepBlocker = null
    }
  }, 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
