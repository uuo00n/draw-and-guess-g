import { useEffect, useState } from 'react'
import type { TeamRoster } from '@shared/schemas/roster'
import { playOrderName, sortGroupsByMemberCountDesc } from '@shared/schemas/roster'
import { TEAM_PALETTE } from '@shared/constants'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { useGameRulesStore } from '@renderer/stores/game-rules-store'

type RosterPanelsProps = {
  roster: TeamRoster
  className?: string
  variant?: 'full' | 'members'
}

export function RosterPanels({
  roster,
  className,
  variant = 'full'
}: RosterPanelsProps): React.JSX.Element {
  const sorted = sortGroupsByMemberCountDesc(roster.groups)

  const membersCard = (
    <Card className="space-y-4">
      <div>
        <CardTitle>人员分组</CardTitle>
        <CardDescription className="mt-2">
          共 {roster.total} 人 · {roster.groupCount} 组 · 按人数从多到少排列，组名依次为第 1 组起
        </CardDescription>
      </div>
      <div className="space-y-3">
        {sorted.map((group, index) => {
          const paletteIndex = roster.groups.findIndex((item) => item.group === group.group)
          const color = TEAM_PALETTE[paletteIndex % TEAM_PALETTE.length]
          return (
            <div
              key={group.group}
              className="rounded-[12px] border border-line bg-midnight/40 p-3"
              style={{ boxShadow: `inset 3px 0 0 ${color}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-morning">{playOrderName(index + 1)}</p>
                <span className="text-xs text-first-03">{group.members.length} 人</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.members.map((member) => (
                  <span
                    key={member}
                    className="rounded-full border border-first-01 bg-elevated px-3 py-1 text-sm text-morning"
                  >
                    {member}
                  </span>
                ))}
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
      <GameRulesCard />
      {membersCard}
    </div>
  )
}

function GameRulesCard(): React.JSX.Element {
  const rules = useGameRulesStore((state) => state.rules)
  const setRules = useGameRulesStore((state) => state.setRules)
  const resetRules = useGameRulesStore((state) => state.resetRules)
  const [text, setText] = useState(rules.join('\n'))

  useEffect(() => {
    setText(rules.join('\n'))
  }, [rules])

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>游戏规则</CardTitle>
      </div>
      <label className="block space-y-2">
        <span className="text-sm text-white">可直接编辑，每行一条规则</span>
        <textarea
          className="w-full resize-none [field-sizing:content] rounded-[12px] border border-line bg-surface px-4 py-3 text-lg leading-relaxed text-white outline-none focus:border-coral md:text-xl"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => setRules(text.split('\n'))}
        />
      </label>
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={resetRules}>
          恢复默认规则
        </Button>
      </div>
    </Card>
  )
}
