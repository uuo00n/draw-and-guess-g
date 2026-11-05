import { z } from 'zod'
import { uuidSchema } from './common'
import { teamRosterSchema } from './roster'

export const gameStatusSchema = z.enum([
  'GAME_READY',
  'GAME_ACTIVE',
  'GAME_FINISHED',
  'GAME_FINISHED_EARLY',
  'GAME_ABORTED'
])

export const historyQuerySchema = z.object({
  keyword: z.string().trim().max(80).optional(),
  status: gameStatusSchema.optional()
})

export const historyListItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  endReason: z.string().nullable(),
  createdAt: z.string(),
  endedAt: z.string().nullable(),
  teamCount: z.number().int(),
  roundCount: z.number().int(),
  plannedTurnCount: z.number().int(),
  finishedTurnCount: z.number().int(),
  notPlayedTurnCount: z.number().int(),
  usedQuestionCount: z.number().int(),
  scoreTotal: z.number().int(),
  outcomeLabel: z.string(),
  activityLabel: z.string().nullable()
})

export const historyQuestionSchema = z.object({
  id: uuidSchema,
  position: z.number().int(),
  text: z.string(),
  category: z.string(),
  points: z.number().int(),
  state: z.string(),
  verdict: z.string().nullable(),
  roundNo: z.number().int().nullable(),
  teamId: uuidSchema.nullable(),
  teamName: z.string().nullable()
})

export const historyTurnSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  roundNo: z.number().int(),
  sequenceNo: z.number().int(),
  status: z.string(),
  endReason: z.string().nullable(),
  turnScore: z.number().int(),
  remainingMs: z.number().int()
})

export const historyTeamSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string(),
  totalScore: z.number().int(),
  rank: z.number().int(),
  finishedTurns: z.number().int(),
  notPlayedTurns: z.number().int(),
  members: z.array(z.string()),
  performer: z.string().nullable()
})

export const historyEventSchema = z.object({
  id: uuidSchema,
  turnId: uuidSchema,
  action: z.string(),
  scoreDelta: z.number().int(),
  remainingMs: z.number().int().nullable(),
  occurredAt: z.string(),
  reason: z.string().nullable(),
  questionText: z.string().nullable()
})

export const historyAdjustmentSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  turnId: uuidSchema.nullable(),
  delta: z.number().int(),
  previousTeamScore: z.number().int(),
  newTeamScore: z.number().int(),
  reason: z.string(),
  createdAt: z.string()
})

export const gameHistorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  endReason: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  roundCount: z.number().int(),
  turnDurationMs: z.number().int(),
  plannedTurnCount: z.number().int(),
  finishedTurnCount: z.number().int(),
  notPlayedTurnCount: z.number().int(),
  showChampion: z.boolean(),
  outcomeLabel: z.string(),
  teams: z.array(historyTeamSchema),
  turns: z.array(historyTurnSchema),
  questions: z.array(historyQuestionSchema),
  events: z.array(historyEventSchema),
  adjustments: z.array(historyAdjustmentSchema)
})

export const dataInfoSchema = z.object({
  dbPath: z.string(),
  bytes: z.number().int(),
  gameCount: z.number().int(),
  version: z.string()
})

export const backupResultSchema = z.object({
  saved: z.boolean(),
  path: z.string().optional()
})

export const restoreResultSchema = z.object({
  restored: z.boolean(),
  safetyPath: z.string().optional()
})

export const clearHistoryResultSchema = z.object({
  deletedCount: z.number().int()
})

export const replaceRosterResultSchema = z.object({
  ok: z.boolean(),
  roster: teamRosterSchema.optional(),
  error: z.string().optional()
})

export type HistoryQuery = z.infer<typeof historyQuerySchema>
export type HistoryListItem = z.infer<typeof historyListItemSchema>
export type GameHistory = z.infer<typeof gameHistorySchema>
export type DataInfo = z.infer<typeof dataInfoSchema>
export type ClearHistoryResult = z.infer<typeof clearHistoryResultSchema>
export type ReplaceRosterResult = z.infer<typeof replaceRosterResultSchema>
