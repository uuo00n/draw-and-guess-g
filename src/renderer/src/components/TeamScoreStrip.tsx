import type { PlaySnapshot } from '@shared/schemas/play'
import { ScoreValue } from '@renderer/components/ScoreValue'

export function TeamScoreStrip({
  snapshot
}: {
  snapshot: PlaySnapshot
}): React.JSX.Element {
  const currentId = snapshot.currentTurn?.teamId
  return (
    <div className="flex flex-wrap gap-2">
      {snapshot.leaderboard
        .slice()
        .sort((a, b) => {
          const aOrder = snapshot.teams.find((team) => team.id === a.teamId)?.sortOrder ?? 0
          const bOrder = snapshot.teams.find((team) => team.id === b.teamId)?.sortOrder ?? 0
          return aOrder - bOrder
        })
        .map((team) => {
          const active = team.teamId === currentId
          return (
            <div
              key={team.teamId}
              className={`min-w-[7.5rem] rounded-lg border px-3 py-2 ${
                active ? 'border-brand-accent bg-brand-accent/15' : 'border-brand-muted/20 bg-brand-bg/40'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                <span className={active ? 'font-semibold text-brand-text' : 'text-brand-muted'}>
                  {active ? `★ ${team.name}` : team.name}
                </span>
              </div>
              <div className="mt-1 text-xl font-semibold">
                <ScoreValue value={team.totalScore} />
              </div>
            </div>
          )
        })}
    </div>
  )
}
