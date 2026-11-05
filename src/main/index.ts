import { writeFileSync } from 'node:fs'
import { app, BrowserWindow, powerSaveBlocker, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
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
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
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
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dbPath = initDatabasePath()
  db = openDatabase(dbPath)
  recoverDatabase(db, timerEngine)
  registerQuestionHandlers(db)
  registerGameHandlers(db)
  registerAppHandlers(db)

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
    if (timing && sleepBlocker == null) sleepBlocker = powerSaveBlocker.start('prevent-display-sleep')
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
