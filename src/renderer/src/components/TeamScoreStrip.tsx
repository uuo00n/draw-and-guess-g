import type { PlaySnapshot } from '@shared/schemas/play'
import { ScoreValue } from '@renderer/components/ScoreValue'
import { formatMembersDisplay } from '@renderer/lib/member-display'
import { cn } from '@renderer/lib/utils'

export function TeamScoreStrip({ snapshot }: { snapshot: PlaySnapshot }): React.JSX.Element {
  const currentId = snapshot.currentTurn?.teamId
  const teamById = new Map(snapshot.teams.map((team) => [team.id, team]))
  const teams = snapshot.leaderboard.slice().sort((a, b) => {
    const aOrder = teamById.get(a.teamId)?.sortOrder ?? 0
    const bOrder = teamById.get(b.teamId)?.sortOrder ?? 0
    return aOrder - bOrder
  })
  const count = teams.length

  return (
    <div className={cn('grid shrink-0 grid-cols-2 gap-2', count > 2 && 'md:grid-cols-4')}>
      {teams.map((team) => {
        const active = team.teamId === currentId
        const members = teamById.get(team.teamId)?.members ?? []
        return (
          <div
            key={team.teamId}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'min-w-0 rounded-[12px] border bg-surface px-2.5 py-2',
              active ? 'border-coral bg-elevated' : 'border-line'
            )}
            style={{ boxShadow: `inset 3px 0 0 ${team.color}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <span
                  title={team.name}
                  className={cn(
                    'truncate text-xs',
                    active ? 'font-semibold text-morning' : 'text-first-03'
                  )}
                >
                  {team.name}
                </span>
              </span>
              {active ? (
                <span className="shrink-0 text-[10px] font-semibold tracking-[0.12em] text-coral">
                  当前
                </span>
              ) : null}
            </div>
            {members.length > 0 ? (
              <p className="mt-1 text-lg leading-snug font-semibold break-words text-white xl:text-xl">
                {formatMembersDisplay(members)}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-base font-semibold text-white tabular-nums">
              <span className="text-gold">
                得分 <ScoreValue value={team.totalScore} />
              </span>
              <span>完成 {team.correctCount}</span>
              <span>跳过 {team.skipCount}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
