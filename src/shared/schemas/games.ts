import { z } from 'zod'
import { DEFAULT_TURN_DURATION_SEC, TURN_DURATION_SEC_MAX, TURN_DURATION_SEC_MIN } from '../constants'
import { uuidSchema } from './common'

export const scoreModeSchema = z.enum(['UNIFORM', 'QUESTION_POINTS'])

export const gameTeamSnapshotSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
  totalScore: z.number().int(),
  members: z.array(z.string()),
  performer: z.string().nullable()
})

export const createGameInputSchema = z
  .object({
    commandId: uuidSchema,
    name: z.string().trim().max(120).optional(),
    bankId: uuidSchema,
    categoryFilter: z.array(z.string()).min(1, '至少选择一个分类'),
    turnDurationSec: z
      .number()
      .int()
      .min(TURN_DURATION_SEC_MIN)
      .max(TURN_DURATION_SEC_MAX)
      .default(DEFAULT_TURN_DURATION_SEC),
    scoreMode: scoreModeSchema.default('UNIFORM'),
    participatingGroupNumbers: z
      .array(z.number().int().positive())
      .min(1, '至少选择一组参赛')
  })
  .superRefine((value, ctx) => {
    const groups = value.participatingGroupNumbers
    if (groups.length > 0 && new Set(groups).size !== groups.length) {
      ctx.addIssue({
        code: 'custom',
        message: '参赛组号不能重复',
        path: ['participatingGroupNumbers']
      })
    }
  })

export const gameTurnSnapshotSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  roundNo: z.number().int(),
  sequenceNo: z.number().int(),
  status: z.string()
})

export const gameSnapshotSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: z.string(),
  roundCount: z.number().int(),
  turnDurationMs: z.number().int(),
  scoreMode: scoreModeSchema,
  plannedTurnCount: z.number().int(),
  queueSize: z.number().int(),
  teams: z.array(gameTeamSnapshotSchema),
  turns: z.array(gameTurnSnapshotSchema)
})

export type CreateGameInput = z.infer<typeof createGameInputSchema>
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>
