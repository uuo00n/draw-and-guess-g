import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { z } from 'zod'
import type { AppDatabase } from '../database/connection'
import { createGameInputSchema } from '../../shared/schemas/games'
import { teamRosterSchema, validateTeamRoster } from '../../shared/schemas/roster'
import { exportBankInputSchema, questionQuerySchema } from '../../shared/schemas/questions'
import {
  abortGameInputSchema,
  gameCommandInputSchema,
  submitAnswerInputSchema,
  type GameUiEvent
} from '../../shared/schemas/play'
import { databaseFileBytes, backupDatabaseFile, restoreDatabaseFile } from '../services/backup-service'
import { getHistory, listHistory } from '../services/history-service'
import { buildResultsWorkbook } from '../services/results-export'
import { historyQuerySchema } from '../../shared/schemas/history'
import type { TimerEngine } from '../domain/timer-engine'
import { createGame } from '../domain/game-create'
import {
  abortGame,
  advanceToNextTeam,
  getPlaySnapshot,
  listGameSummaries,
  pauseTurn,
  resetTurnTimer,
  resumeTurn,
  startTurn,
  submitAnswer,
  undoLastAnswer
} from '../domain/game-engine'
import { timerEngine } from '../domain/timer-engine'
import {
  buildTemplateWorkbook,
  exportBankWorkbook
} from '../services/excel-service'
import {
  commitImportRows,
  countActiveQuestions,
  getBankExportRows,
  getBankName,
  listBanks,
  listQuestions,
  parseImportFile
} from '../services/question-service'
import { IMPORT_MAX_BYTES } from '../../shared/constants'
import { loadCurrentRoster, saveCurrentRoster, RosterValidationError } from '../services/roster-service'
import { purgeAllGames } from '../services/game-purge'

export function registerQuestionHandlers(db: AppDatabase): void {
  ipcMain.handle('questions:importFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '题库', extensions: ['xlsx', 'csv'] },
        { name: 'All', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const }
    }
    const filePath = result.filePaths[0]
    const fs = await import('node:fs/promises')
    const buffer = await fs.readFile(filePath)
    if (buffer.byteLength > IMPORT_MAX_BYTES) {
      throw new Error('文件超过 5MB 上限')
    }
    const fileName = filePath.split(/[/\\]/).pop() ?? 'import.xlsx'
    const rows = await parseImportFile({ fileName, buffer })
    const importResult = commitImportRows(db, fileName, buffer, rows)
    return { canceled: false as const, result: importResult }
  })

  ipcMain.handle('questions:listBanks', () => listBanks(db))

  ipcMain.handle('questions:list', (_event, rawQuery: unknown) => {
    const query = questionQuerySchema.parse(rawQuery)
    return listQuestions(db, query)
  })

  ipcMain.handle('questions:exportTemplate', async () => {
    const buffer = await buildTemplateWorkbook()
    const save = await dialog.showSaveDialog({
      defaultPath: '你画我猜-题库模板.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (save.canceled || !save.filePath) return { saved: false }
    const fs = await import('node:fs/promises')
    await fs.writeFile(save.filePath, buffer)
    return { saved: true }
  })

  ipcMain.handle('questions:exportBank', async (_event, raw: unknown) => {
    const input = exportBankInputSchema.parse(raw)
    const rows = getBankExportRows(db, input.bankId)
    const bankName = getBankName(db, input.bankId)
    const buffer = await exportBankWorkbook(bankName, rows)
    const save = await dialog.showSaveDialog({
      defaultPath: `${bankName}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (save.canceled || !save.filePath) return { saved: false }
    const fs = await import('node:fs/promises')
    await fs.writeFile(save.filePath, buffer)
    return { saved: true }
  })
}

function publish(uiEvent: GameUiEvent | undefined): void {
  if (!uiEvent) return
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('game:ui-event', uiEvent)
  }
}

function settle<T extends { uiEvent?: GameUiEvent }>(result: T): Omit<T, 'uiEvent'> {
  publish(result.uiEvent)
  const { uiEvent: _uiEvent, ...rest } = result
  return rest
}

export function registerGameHandlers(db: AppDatabase, options: { dataDir: string }): void {
  ipcMain.handle('games:create', (_event, raw: unknown) => {
    const input = createGameInputSchema.parse(raw)
    return createGame(db, input, { dataDir: options.dataDir })
  })

  ipcMain.handle('games:get', (_event, gameId: unknown) => {
    if (typeof gameId !== 'string') throw new Error('gameId must be string')
    return getPlaySnapshot(db, gameId, { timer: timerEngine })
  })

  ipcMain.handle('games:list', () => listGameSummaries(db, timerEngine))

  ipcMain.handle('games:startTurn', (_event, raw: unknown) =>
    settle(startTurn(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:submitAnswer', (_event, raw: unknown) =>
    settle(submitAnswer(db, submitAnswerInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:pause', (_event, raw: unknown) =>
    settle(pauseTurn(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:resume', (_event, raw: unknown) =>
    settle(resumeTurn(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:resetTurnTimer', (_event, raw: unknown) =>
    settle(resetTurnTimer(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:undo', (_event, raw: unknown) =>
    settle(undoLastAnswer(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:advance', (_event, raw: unknown) =>
    settle(advanceToNextTeam(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:abort', (_event, raw: unknown) =>
    settle(abortGame(db, abortGameInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:listHistory', (_event, raw: unknown) =>
    listHistory(db, historyQuerySchema.parse(raw ?? {}))
  )

  ipcMain.handle('games:getHistory', (_event, gameId: unknown) => {
    if (typeof gameId !== 'string') throw new Error('gameId must be string')
    return getHistory(db, gameId)
  })

  ipcMain.handle('games:exportResults', async (_event, gameId: unknown) => {
    if (typeof gameId !== 'string') throw new Error('gameId must be string')
    const history = getHistory(db, gameId)
    const buffer = await buildResultsWorkbook(db, gameId)
    const save = await dialog.showSaveDialog({
      defaultPath: `${history.name}-成绩.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (save.canceled || !save.filePath) return { saved: false }
    const fs = await import('node:fs/promises')
    await fs.writeFile(save.filePath, buffer)
    return { saved: true, path: save.filePath }
  })
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function registerAppHandlers(
  db: AppDatabase,
  options: { dbPath: string; dataDir: string; timer: TimerEngine }
): void {
  ipcMain.handle('app:getHomeSummary', () => {
    const roster = loadCurrentRoster(options.dataDir)
    return {
      activeQuestionCount: countActiveQuestions(db),
      version: app.getVersion(),
      rosterGroupCount: roster.groupCount,
      rosterMemberCount: roster.total
    }
  })

  ipcMain.handle('app:getRoster', () => loadCurrentRoster(options.dataDir))

  ipcMain.handle('app:previewRosterFile', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false as const, error: '已取消' }
    }
    try {
      const raw = JSON.parse(readFileSync(picked.filePaths[0], 'utf8')) as unknown
      const roster = validateTeamRoster(raw)
      return { ok: true as const, roster: teamRosterSchema.parse(roster) }
    } catch (error) {
      const message =
        error instanceof RosterValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : '无法读取分组 JSON'
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('app:saveRoster', (_event, raw: unknown) => {
    const roster = teamRosterSchema.parse(raw)
    saveCurrentRoster(options.dataDir, roster)
    return roster
  })

  ipcMain.handle('app:clearAllHistory', () => ({
    deletedCount: purgeAllGames(db, options.timer)
  }))

  ipcMain.handle('app:getDataInfo', () => ({
    dbPath: options.dbPath,
    bytes: databaseFileBytes(options.dbPath),
    gameCount: Number((db.prepare('SELECT COUNT(*) AS c FROM games').get() as { c: number }).c),
    version: app.getVersion()
  }))

  ipcMain.handle('app:setFullscreen', (_event, raw: unknown) => {
    const enabled = z.boolean().parse(raw)
    const win = focusedWindow()
    win?.setFullScreen(enabled)
    return win?.isFullScreen() ?? false
  })

  ipcMain.handle('app:toggleFullscreen', () => {
    const win = focusedWindow()
    if (!win) return false
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  })

  ipcMain.handle('app:openDataFolder', () => {
    shell.showItemInFolder(options.dbPath)
    return true
  })

  ipcMain.handle('app:backupDatabase', async () => {
    const save = await dialog.showSaveDialog({
      defaultPath: 'draw-and-guess-backup.db',
      filters: [{ name: 'SQLite', extensions: ['db'] }]
    })
    if (save.canceled || !save.filePath) return { saved: false }
    await backupDatabaseFile(db, save.filePath)
    return { saved: true, path: save.filePath }
  })

  ipcMain.handle('app:restoreDatabase', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'SQLite', extensions: ['db'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return { restored: false }
    const safetyPath = join(dirname(options.dbPath), `pre-restore-${Date.now()}.db`)
    await restoreDatabaseFile(db, picked.filePaths[0], safetyPath, options.timer)
    return { restored: true, safetyPath }
  })
}

export function initDatabasePath(): { dbPath: string; dataDir: string } {
  const dataDir = app.getPath('userData') + '/data'
  const dbPath = dataDir + '/draw-and-guess.db'
  mkdirSync(dataDir, { recursive: true })
  return { dbPath, dataDir }
}
