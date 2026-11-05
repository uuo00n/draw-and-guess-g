import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { AppDatabase } from '../database/connection'
import { createGameInputSchema } from '../../shared/schemas/games'
import { exportBankInputSchema, questionQuerySchema } from '../../shared/schemas/questions'
import {
  abortGameInputSchema,
  gameCommandInputSchema,
  submitAnswerInputSchema,
  type GameUiEvent
} from '../../shared/schemas/play'
import { createGame } from '../domain/game-create'
import {
  abortGame,
  advanceToNextTeam,
  getPlaySnapshot,
  listGameSummaries,
  pauseTurn,
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

export function registerGameHandlers(db: AppDatabase): void {
  ipcMain.handle('games:create', (_event, raw: unknown) => {
    const input = createGameInputSchema.parse(raw)
    return createGame(db, input)
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

  ipcMain.handle('games:undo', (_event, raw: unknown) =>
    settle(undoLastAnswer(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:advance', (_event, raw: unknown) =>
    settle(advanceToNextTeam(db, gameCommandInputSchema.parse(raw), { timer: timerEngine }))
  )

  ipcMain.handle('games:abort', (_event, raw: unknown) =>
    settle(abortGame(db, abortGameInputSchema.parse(raw), { timer: timerEngine }))
  )
}

export function registerAppHandlers(db: AppDatabase): void {
  ipcMain.handle('app:getHomeSummary', () => ({
    activeQuestionCount: countActiveQuestions(db),
    version: app.getVersion()
  }))
}

export function initDatabasePath(): string {
  const dbPath = app.getPath('userData') + '/data/draw-and-guess.db'
  mkdirSync(dirname(dbPath), { recursive: true })
  return dbPath
}
