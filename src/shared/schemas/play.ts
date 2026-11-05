import { z } from 'zod'
import { uuidSchema } from './common'
import { gameSnapshotSchema } from './games'

export const playPhaseSchema = z.enum([
  'ready',
  'running',
  'paused',
  'turn-result',
  'final',
  'final-early',
  'aborted',
  'recovery'
])

export const currentTurnSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  roundNo: z.number().int(),
  sequenceNo: z.number().int(),
  status: z.string(),
  remainingMs: z.number().int(),
  turnScore: z.number().int(),
  endReason: z.string().nullable(),
  correctCount: z.number().int(),
  skipCount: z.number().int(),
  timeoutCount: z.number().int()
})

export const currentQuestionSchema = z.object({
  queueItemId: uuidSchema,
  text: z.string(),
  category: z.string(),
  points: z.number().int()
})

export const leaderboardEntrySchema = z.object({
  teamId: uuidSchema,
  name: z.string(),
  color: z.string(),
  totalScore: z.number().int(),
  rank: z.number().int()
})

export const playSnapshotSchema = gameSnapshotSchema.extend({
  endReason: z.string().nullable(),
  currentTurnId: uuidSchema.nullable(),
  currentTurn: currentTurnSchema.nullable(),
  currentQuestion: currentQuestionSchema.nullable(),
  phase: playPhaseSchema,
  recoveryRequired: z.boolean(),
  recoveryReason: z.string().nullable(),
  leaderboard: z.array(leaderboardEntrySchema),
  showChampion: z.boolean(),
  championTeamId: uuidSchema.nullable(),
  canStart: z.boolean(),
  canAdvance: z.boolean(),
  canAnswer: z.boolean(),
  canPause: z.boolean(),
  canResume: z.boolean(),
  canUndo: z.boolean(),
  canResetTimer: z.boolean(),
  syncKey: z.string(),
  unusedCount: z.number().int()
})

export const submitAnswerInputSchema = z.object({
  commandId: z.string().uuid(),
  gameId: uuidSchema,
  turnId: uuidSchema,
  currentQueueItemId: uuidSchema,
  verdict: z.enum(['CORRECT', 'SKIPPED'])
})

export const gameCommandInputSchema = z.object({
  commandId: z.string().uuid(),
  gameId: uuidSchema
})

export const abortGameInputSchema = gameCommandInputSchema.extend({
  reason: z.string().trim().max(200).optional()
})

export const gameCommandResultSchema = z.object({
  snapshot: playSnapshotSchema,
  applied: z.boolean(),
  eventId: z.string().optional(),
  rejectReason: z.string().optional()
})

export const gameUiEventSchema = z.object({
  eventId: z.string(),
  gameId: uuidSchema,
  kind: z.enum([
    'ANSWER_ACCEPTED',
    'TURN_STARTED',
    'TURN_ENDED',
    'GAME_FINISHED',
    'GAME_FINISHED_EARLY',
    'GAME_ABORTED'
  ]),
  verdict: z.enum(['CORRECT', 'SKIPPED', 'TIMEOUT']).optional(),
  turnSequenceNo: z.number().int().positive().optional(),
  emittedAt: z.string()
})

export const gameSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: z.string(),
  createdAt: z.string(),
  phase: playPhaseSchema
})

export type PlaySnapshot = z.infer<typeof playSnapshotSchema>
export type SubmitAnswerInput = z.infer<typeof submitAnswerInputSchema>
export type GameCommandInput = z.infer<typeof gameCommandInputSchema>
export type AbortGameInput = z.infer<typeof abortGameInputSchema>
export type GameCommandResult = z.infer<typeof gameCommandResultSchema>
export type GameUiEvent = z.infer<typeof gameUiEventSchema>
export type GameSummary = z.infer<typeof gameSummarySchema>
export type PlayPhase = z.infer<typeof playPhaseSchema>
