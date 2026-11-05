import { contextBridge, ipcRenderer } from 'electron'
import {
  createGameInputSchema,
  type CreateGameInput,
  type GameSnapshot
} from '../shared/schemas/games'
import { homeSummarySchema, type HomeSummary } from '../shared/schemas/app'
import {
  backupResultSchema,
  clearHistoryResultSchema,
  dataInfoSchema,
  gameHistorySchema,
  historyListItemSchema,
  historyQuerySchema,
  replaceRosterResultSchema,
  restoreResultSchema,
  type DataInfo,
  type GameHistory,
  type HistoryListItem,
  type HistoryQuery
} from '../shared/schemas/history'
import { teamRosterSchema, type TeamRoster } from '../shared/schemas/roster'
import {
  abortGameInputSchema,
  gameCommandInputSchema,
  gameCommandResultSchema,
  gameSummarySchema,
  gameUiEventSchema,
  playSnapshotSchema,
  submitAnswerInputSchema,
  type AbortGameInput,
  type GameCommandInput,
  type GameCommandResult,
  type GameSummary,
  type GameUiEvent,
  type PlaySnapshot,
  type SubmitAnswerInput
} from '../shared/schemas/play'
import { z } from 'zod'
import {
  exportBankInputSchema,
  questionQuerySchema,
  type ImportResult,
  type QuestionBankSummary,
  type QuestionPage,
  type QuestionQuery
} from '../shared/schemas/questions'

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>
}

const gameAPI = {
  questions: {
    importFile: (): Promise<
      { canceled: true } | { canceled: false; result: ImportResult }
    > => invoke('questions:importFile'),
    listBanks: (): Promise<QuestionBankSummary[]> => invoke('questions:listBanks'),
    list: (query: QuestionQuery): Promise<QuestionPage> =>
      invoke('questions:list', questionQuerySchema.parse(query)),
    exportTemplate: (): Promise<{ saved: boolean }> => invoke('questions:exportTemplate'),
    exportBank: (input: { bankId: string; format: 'xlsx' }): Promise<{ saved: boolean }> =>
      invoke('questions:exportBank', exportBankInputSchema.parse(input))
  },
  games: {
    create: (config: CreateGameInput): Promise<GameSnapshot> =>
      invoke('games:create', createGameInputSchema.parse(config)),
    get: (gameId: string): Promise<PlaySnapshot> =>
      invoke('games:get', gameId).then((raw) => playSnapshotSchema.parse(raw)),
    list: (): Promise<GameSummary[]> =>
      invoke('games:list').then((raw) => z.array(gameSummarySchema).parse(raw)),
    startTurn: (input: GameCommandInput): Promise<GameCommandResult> =>
      invoke('games:startTurn', gameCommandInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    submitAnswer: (input: SubmitAnswerInput): Promise<GameCommandResult> =>
      invoke('games:submitAnswer', submitAnswerInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    pause: (input: GameCommandInput): Promise<GameCommandResult> =>
      invoke('games:pause', gameCommandInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    resume: (input: GameCommandInput): Promise<GameCommandResult> =>
      invoke('games:resume', gameCommandInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    resetTurnTimer: (input: GameCommandInput): Promise<GameCommandResult> =>
      invoke('games:resetTurnTimer', gameCommandInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    undoLastAnswer: (input: GameCommandInput): Promise<GameCommandResult> =>
      invoke('games:undo', gameCommandInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    advanceToNextTeam: (input: GameCommandInput): Promise<GameCommandResult> =>
      invoke('games:advance', gameCommandInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    abort: (input: AbortGameInput): Promise<GameCommandResult> =>
      invoke('games:abort', abortGameInputSchema.parse(input)).then((raw) =>
        gameCommandResultSchema.parse(raw)
      ),
    listHistory: (query: HistoryQuery = {}): Promise<HistoryListItem[]> =>
      invoke('games:listHistory', historyQuerySchema.parse(query)).then((raw) =>
        z.array(historyListItemSchema).parse(raw)
      ),
    getHistory: (gameId: string): Promise<GameHistory> =>
      invoke('games:getHistory', gameId).then((raw) => gameHistorySchema.parse(raw)),
    exportResults: (gameId: string): Promise<{ saved: boolean; path?: string }> =>
      invoke('games:exportResults', gameId)
  },
  app: {
    getHomeSummary: (): Promise<HomeSummary> =>
      invoke('app:getHomeSummary').then((raw) => homeSummarySchema.parse(raw)),
    getDataInfo: (): Promise<DataInfo> =>
      invoke('app:getDataInfo').then((raw) => dataInfoSchema.parse(raw)),
    setFullscreen: (enabled: boolean): Promise<boolean> =>
      invoke('app:setFullscreen', z.boolean().parse(enabled)),
    toggleFullscreen: (): Promise<boolean> => invoke('app:toggleFullscreen'),
    resetPageZoom: (): Promise<number> => invoke('app:resetPageZoom'),
    openDataFolder: (): Promise<boolean> => invoke('app:openDataFolder'),
    backupDatabase: (): Promise<{ saved: boolean; path?: string }> =>
      invoke('app:backupDatabase').then((raw) => backupResultSchema.parse(raw)),
    restoreDatabase: (): Promise<{ restored: boolean; safetyPath?: string }> =>
      invoke('app:restoreDatabase').then((raw) => restoreResultSchema.parse(raw)),
    getRoster: (): Promise<TeamRoster> =>
      invoke('app:getRoster').then((raw) => teamRosterSchema.parse(raw)),
    replaceRosterFile: (): Promise<{ ok: boolean; roster?: TeamRoster; error?: string }> =>
      invoke('app:previewRosterFile').then((raw) => replaceRosterResultSchema.parse(raw)),
    saveRoster: (roster: TeamRoster): Promise<TeamRoster> =>
      invoke('app:saveRoster', teamRosterSchema.parse(roster)).then((raw) =>
        teamRosterSchema.parse(raw)
      ),
    clearAllHistory: (): Promise<{ deletedCount: number }> =>
      invoke('app:clearAllHistory').then((raw) => clearHistoryResultSchema.parse(raw)),
    resetUsedQuestions: (): Promise<number | null> =>
      invoke('app:resetUsedQuestions').then((raw) => z.number().int().nonnegative().nullable().parse(raw))
  },
  events: {
    subscribe: (handler: (event: GameUiEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: unknown): void => {
        handler(gameUiEventSchema.parse(payload))
      }
      ipcRenderer.on('game:ui-event', listener)
      return () => {
        ipcRenderer.removeListener('game:ui-event', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('gameAPI', gameAPI)

export type GameAPI = typeof gameAPI
