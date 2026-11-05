import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { app, dialog, openDatabase, appendFileSync, restore, show, focus } = vi.hoisted(() => ({
  app: {
    exit: vi.fn(),
    getPath: vi.fn(),
    on: vi.fn(),
    requestSingleInstanceLock: vi.fn(),
    setName: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn()
  },
  dialog: { showErrorBox: vi.fn() },
  openDatabase: vi.fn(),
  appendFileSync: vi.fn(),
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn()
}))

vi.mock('electron', () => ({
  app,
  BrowserWindow: {
    getAllWindows: () => [{ isVisible: () => true, isMinimized: () => true, restore, show, focus }]
  },
  dialog,
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  powerSaveBlocker: {}
}))
vi.mock('@electron-toolkit/utils', () => ({ electronApp: { setAppUserModelId: vi.fn() } }))
vi.mock('../resources/icon.png?asset', () => ({ default: 'icon.png' }))
vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  mkdirSync: vi.fn(),
  appendFileSync
}))
vi.mock('../src/main/database/connection', () => ({ openDatabase }))
vi.mock('../src/main/ipc/register-handlers', () => ({
  initDatabasePath: () => ({ dbPath: '/legacy/data/draw-and-guess.db' }),
  registerQuestionHandlers: vi.fn(),
  registerGameHandlers: vi.fn(),
  registerAppHandlers: vi.fn()
}))

describe('desktop startup', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('E2E_GAME_FLOW', undefined)
    vi.stubEnv('E2E_USER_DATA', undefined)
    app.getPath.mockReturnValue('/profiles')
    app.whenReady.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sets the existing data path before locking and exits a duplicate before database startup', async () => {
    app.requestSingleInstanceLock.mockReturnValue(false)
    await import('../src/main/index')

    expect(app.setPath).toHaveBeenCalledWith('userData', join('/profiles', '你画我猜'))
    expect(app.setPath).toHaveBeenCalledBefore(app.requestSingleInstanceLock)
    expect(app.whenReady).not.toHaveBeenCalled()
    expect(openDatabase).not.toHaveBeenCalled()
    expect(app.exit).toHaveBeenCalledWith(0)
  })

  it('restores and focuses the existing window when a second launch is reported', async () => {
    app.requestSingleInstanceLock.mockReturnValue(true)
    app.whenReady.mockReturnValue(new Promise(() => {}))
    await import('../src/main/index')

    const secondInstance = app.on.mock.calls.find(([event]) => event === 'second-instance')?.[1]
    secondInstance()
    expect(restore).toHaveBeenCalledBefore(focus)
    expect(show).toHaveBeenCalledOnce()
  })

  it('logs the original startup failure and shows the selected data path', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    app.requestSingleInstanceLock.mockReturnValue(true)
    openDatabase.mockImplementation(() => {
      throw new Error('Native SQLite load failed')
    })

    await import('../src/main/index')
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(1))

    const userData = join('/profiles', '你画我猜')
    expect(appendFileSync).toHaveBeenCalledWith(
      join(userData, 'startup-error.log'),
      expect.stringContaining('Native SQLite load failed')
    )
    expect(dialog.showErrorBox).toHaveBeenCalledWith(
      'Genpact-draw&guess 启动失败',
      expect.stringContaining(userData)
    )
  })
})
