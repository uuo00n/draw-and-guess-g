import { contextBridge, ipcRenderer } from 'electron'
import {
  createGameInputSchema,
  type CreateGameInput,
  type GameSnapshot
} from '../shared/schemas/games'
import { homeSummarySchema, type HomeSummary } from '../shared/schemas/app'
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
    get: (gameId: string): Promise<GameSnapshot> => invoke('games:get', gameId)
  },
  app: {
    getHomeSummary: (): Promise<HomeSummary> =>
      invoke('app:getHomeSummary').then((raw) => homeSummarySchema.parse(raw))
  },
  events: {
    subscribe: (_handler: (event: unknown) => void): (() => void) => {
      return () => undefined
    }
  }
}

contextBridge.exposeInMainWorld('gameAPI', gameAPI)

export type GameAPI = typeof gameAPI
