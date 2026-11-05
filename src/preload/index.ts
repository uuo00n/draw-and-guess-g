import { contextBridge, ipcRenderer } from 'electron'
import {
  createGameInputSchema,
  type CreateGameInput,
  type GameSnapshot
} from '../shared/schemas/games'
import { homeSummarySchema, type HomeSummary } from '../shared/schemas/app'
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
      )
  },
  app: {
    getHomeSummary: (): Promise<HomeSummary> =>
      invoke('app:getHomeSummary').then((raw) => homeSummarySchema.parse(raw))
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
