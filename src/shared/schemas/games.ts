import { z } from 'zod'
import {
  DEFAULT_ROUND_COUNT,
  DEFAULT_TURN_DURATION_SEC,
  ROUND_COUNT_MAX,
  ROUND_COUNT_MIN,
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  TURN_DURATION_SEC_MAX,
  TURN_DURATION_SEC_MIN
} from '../constants'
import { uuidSchema } from './common'

export const scoreModeSchema = z.enum(['UNIFORM', 'QUESTION_POINTS'])

export const teamConfigSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  sortOrder: z.number().int().min(0)
})

export const createGameInputSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    bankId: uuidSchema,
    categoryFilter: z.array(z.string()).optional(),
    roundCount: z.number().int().min(ROUND_COUNT_MIN).max(ROUND_COUNT_MAX).default(DEFAULT_ROUND_COUNT),
    turnDurationSec: z
      .number()
      .int()
      .min(TURN_DURATION_SEC_MIN)
      .max(TURN_DURATION_SEC_MAX)
      .default(DEFAULT_TURN_DURATION_SEC),
    scoreMode: scoreModeSchema.default('UNIFORM'),
    teams: z.array(teamConfigSchema).min(TEAM_COUNT_MIN).max(TEAM_COUNT_MAX)
  })
  .superRefine((value, ctx) => {
    const names = value.teams.map((t) => t.name)
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', message: '队伍名称不能重复', path: ['teams'] })
    }
  })

export const gameTeamSnapshotSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
  totalScore: z.number().int()
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
