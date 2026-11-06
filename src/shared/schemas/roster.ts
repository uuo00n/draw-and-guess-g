import { z } from 'zod'
import { TEAM_COUNT_MAX, TEAM_COUNT_MIN } from '../constants'
import { normalizeMemberName } from '../normalize'

export const rosterGroupSchema = z.object({
  group: z.number().int().positive(),
  members: z.array(z.string()).min(1)
})

export const teamRosterSchema = z.object({
  total: z.number().int().positive(),
  groupCount: z.number().int().min(TEAM_COUNT_MIN).max(TEAM_COUNT_MAX),
  groups: z.array(rosterGroupSchema).min(TEAM_COUNT_MIN).max(TEAM_COUNT_MAX)
})

export type TeamRoster = z.infer<typeof teamRosterSchema>

export class RosterValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RosterValidationError'
  }
}

export function validateTeamRoster(raw: unknown): TeamRoster {
  const parsed = teamRosterSchema.safeParse(raw)
  if (!parsed.success) {
    throw new RosterValidationError(parsed.error.issues[0]?.message ?? '分组 JSON 格式无效')
  }
  const roster = parsed.data
  if (roster.groups.length !== roster.groupCount) {
    throw new RosterValidationError('groups 数量与 groupCount 不一致')
  }
  const memberTotal = roster.groups.reduce((sum, group) => sum + group.members.length, 0)
  if (memberTotal !== roster.total) {
    throw new RosterValidationError('total 与成员总数不一致')
  }
  const groupNumbers = roster.groups.map((group) => group.group)
  if (new Set(groupNumbers).size !== groupNumbers.length) {
    throw new RosterValidationError('组号不能重复')
  }
  const normalizedNames = new Set<string>()
  for (const group of roster.groups) {
    for (const member of group.members) {
      const name = normalizeMemberName(member)
      if (!name) {
        throw new RosterValidationError('成员姓名不能为空')
      }
      if (normalizedNames.has(name)) {
        throw new RosterValidationError(`成员姓名重复：${name}`)
      }
      normalizedNames.add(name)
    }
  }
  return {
    ...roster,
    groups: [...roster.groups]
      .sort((a, b) => a.group - b.group)
      .map((group) => ({
        group: group.group,
        members: group.members.map((member) => normalizeMemberName(member))
      }))
  }
}

export function rosterSummary(roster: TeamRoster): { groupCount: number; total: number } {
  return { groupCount: roster.groupCount, total: roster.total }
}

export function groupDisplayName(groupNo: number): string {
  return `第 ${groupNo} 组`
}

export function sortGroupsByMemberCountDesc<T extends { group: number; members: string[] }>(
  groups: T[]
): T[] {
  return [...groups].sort(
    (a, b) => b.members.length - a.members.length || a.group - b.group
  )
}

/** 出场顺序上的组名（1 起），与 JSON 里的 group 字段无关 */
export function playOrderName(playOrder: number): string {
  return groupDisplayName(playOrder)
}

export function formatPlayOrderRange(teamCount: number): string {
  if (teamCount <= 0) return ''
  if (teamCount === 1) return playOrderName(1)
  return `${playOrderName(1)} → ${playOrderName(teamCount)}`
}

export function formatGroupRange(roster: TeamRoster): string {
  return formatPlayOrderRange(roster.groupCount)
}

/** 与 doc/game-rules-default.txt 一致（每行一条，join('\n') 为完整默认文案） */
export const GAME_RULE_BULLETS = [
  '你来比划我来猜 · 游戏规则',
  '1. 分组与赛制',
  '一共 8 组，分为两轮比赛，每轮 4 组。',
  '两轮成绩相互独立，每轮猜对题目最多的一组获得本轮优胜。',
  '2. 比赛时间',
  '正赛每组 120 秒，猜对 1 题得 1 分。',
  '每组有 5 次跳过机会，选择跳过后直接进入下一题。',
  '3. 表演规则',
  '表演者只能通过肢体动作、面部表情和语气词进行提示。',
  '全程不能说话，也不能通过嘴型表达文字。',
  '不能用手书写汉字、拼音、字母或数字提示答案。',
  '猜出完整题目才计 1 分。',
  '4. 平分加赛',
  '如果本轮最高分出现并列，仅由并列第一的组进行加赛。',
  '加赛时间为 30 秒，猜对题目最多的组获胜。',
  '如果再次打平，则继续加赛，直到产生本轮优胜组。'
] as const
