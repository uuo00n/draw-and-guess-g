import type { TeamRoster } from '@shared/schemas/roster'
import {
  GAME_RULE_BULLETS,
  formatGroupRange,
  groupDisplayName
} from '@shared/schemas/roster'
import { TEAM_PALETTE } from '@shared/constants'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { normalizeMemberName } from '@shared/normalize'

type RosterPanelsProps = {
  roster: TeamRoster
  className?: string
  performerMembers?: string[]
  onTogglePerformer?: (memberName: string, groupMemberNames: string[]) => void
  variant?: 'full' | 'members'
}

export function RosterPanels({
  roster,
  className,
  performerMembers = [],
  onTogglePerformer,
  variant = 'full'
}: RosterPanelsProps): React.JSX.Element {
  const performers = new Set(performerMembers.map((name) => normalizeMemberName(name)))
  const sorted = [...roster.groups].sort((a, b) => a.group - b.group)

  const membersCard = (
    <Card className="space-y-4">
      <div>
        <CardTitle>人员分组</CardTitle>
        <CardDescription className="mt-2">
          共 {roster.total} 人 · {roster.groupCount} 组
        </CardDescription>
      </div>
      <div className="space-y-3">
        {sorted.map((group, index) => {
          const color = TEAM_PALETTE[index % TEAM_PALETTE.length]
          return (
            <div
              key={group.group}
              className="rounded-[12px] border border-line bg-midnight/40 p-3"
              style={{ boxShadow: `inset 3px 0 0 ${color}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-morning">{groupDisplayName(group.group)}</p>
                <span className="text-xs text-first-03">{group.members.length} 人</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.members.map((member) => {
                  const normalized = normalizeMemberName(member)
                  const isPerformer = performers.has(normalized)
                  if (onTogglePerformer) {
                    return (
                      <button
                        key={member}
                        type="button"
                        onClick={() => onTogglePerformer(member, group.members)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-sm transition-colors',
                          isPerformer
                            ? 'border-coral bg-coral/15 font-semibold text-morning'
                            : 'border-first-01 bg-elevated text-morning hover:border-coral/50'
                        )}
                      >
                        {isPerformer ? `${member} · 表演题目` : member}
                      </button>
                    )
                  }
                  return (
                    <span
                      key={member}
                      className="rounded-full border border-first-01 bg-elevated px-3 py-1 text-sm text-morning"
                    >
                      {member}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )

  if (variant === 'members') {
    return <div className={className}>{membersCard}</div>
  }

  return (
    <div className={cn('grid gap-6 xl:grid-cols-2', className)}>
      <Card className="space-y-4">
        <div>
          <CardTitle>游戏规则</CardTitle>
          <CardDescription className="mt-2">
            出场顺序为 {formatGroupRange(roster)}，每轮重复。默认 60 秒说明以创建比赛时冻结的时长为准。
          </CardDescription>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-first-03">
          {GAME_RULE_BULLETS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </Card>
      {membersCard}
    </div>
  )
}
