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

export function formatGroupRange(roster: TeamRoster): string {
  const sorted = sortGroupsByMemberCountDesc(roster.groups)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return groupDisplayName(sorted[0].group)
  return sorted.map((group) => groupDisplayName(group.group)).join(' → ')
}

export const GAME_RULE_BULLETS = [
  '单屏公开出题。题目直接显示在大屏上。猜题的人不要看屏幕，画画的人看屏幕。',
  '一次只有一组在挑战，不会两组同时计时。',
  '出场顺序按人数从多到少；人数相同则按组号从小到大。每场默认一轮。',
  '每组单独计时，默认 60 秒。答对或跳过立刻换下一题，剩余时间不重置。',
  '答对加 1 分。跳过不加分。每组每场最多跳过 5 次。时间到 0 时，当前这题记为超时，不能再加分。',
  '本组结束后停在结算页。下一组要等主持人在准备页手动开始。',
  '同一场比赛里，同一道题只会第一次抽出一次。跳过、超时和作废的题都不会回到题库。',
  '题目用完时，本场提前结束，不授冠军。只有全部计划挑战都按时结束，才是正常结束。',
  '组内不指定谁画、谁猜。',
  '暂停不计时。撤销只收回本组最近一次答对或跳过，不把时间加回去。'
] as const
