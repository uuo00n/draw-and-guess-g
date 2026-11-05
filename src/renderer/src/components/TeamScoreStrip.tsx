import type { PlaySnapshot } from '@shared/schemas/play'
import { ScoreValue } from '@renderer/components/ScoreValue'
import { cn } from '@renderer/lib/utils'

export function TeamScoreStrip({ snapshot }: { snapshot: PlaySnapshot }): React.JSX.Element {
  const currentId = snapshot.currentTurn?.teamId
  const teams = snapshot.leaderboard.slice().sort((a, b) => {
    const aOrder = snapshot.teams.find((team) => team.id === a.teamId)?.sortOrder ?? 0
    const bOrder = snapshot.teams.find((team) => team.id === b.teamId)?.sortOrder ?? 0
    return aOrder - bOrder
  })
  const count = teams.length

  return (
    <div
      className={cn(
        'grid gap-2',
        count > 8 && 'grid-cols-4 md:grid-cols-6 xl:grid-cols-12',
        count > 4 && count <= 8 && 'grid-cols-4 lg:grid-cols-8',
        count <= 4 && 'grid-cols-2 lg:grid-cols-4'
      )}
    >
      {teams.map((team) => {
        const active = team.teamId === currentId
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
            <div className="mt-1 text-lg font-semibold text-gold tabular-nums xl:text-xl">
              <ScoreValue value={team.totalScore} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
