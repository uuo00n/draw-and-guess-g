import { z } from 'zod'
import {
  DEFAULT_ROUND_COUNT,
  DEFAULT_TURN_DURATION_SEC,
  ROUND_COUNT_MAX,
  ROUND_COUNT_MIN,
  TURN_DURATION_SEC_MAX,
  TURN_DURATION_SEC_MIN
} from '../constants'
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
    roundCount: z
      .number()
      .int()
      .min(ROUND_COUNT_MIN)
      .max(ROUND_COUNT_MAX)
      .default(DEFAULT_ROUND_COUNT),
    turnDurationSec: z
      .number()
      .int()
      .min(TURN_DURATION_SEC_MIN)
      .max(TURN_DURATION_SEC_MAX)
      .default(DEFAULT_TURN_DURATION_SEC),
    scoreMode: scoreModeSchema.default('UNIFORM'),
    performerMembers: z.array(z.string()).default([])
  })
  .superRefine((value, ctx) => {
    const normalized = value.performerMembers.map((name) => name.trim()).filter(Boolean)
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({ code: 'custom', message: '表演题目标记不能重复', path: ['performerMembers'] })
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
