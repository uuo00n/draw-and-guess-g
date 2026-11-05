import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { GameHistory } from '@shared/schemas/history'
import { PageShell } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'

export function HistoryDetailPage(): React.JSX.Element {
  const { gameId = '' } = useParams()
  const [history, setHistory] = useState<GameHistory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roundNo, setRoundNo] = useState<number | 'all'>('all')
  const [teamId, setTeamId] = useState<string | 'all'>('all')
  const [exportNote, setExportNote] = useState<string | null>(null)

  useEffect(() => {
    void window.gameAPI.games
      .getHistory(gameId)
      .then(setHistory)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '无法读取详情')
      )
  }, [gameId])

  const questions = useMemo(() => {
    if (!history) return []
    return history.questions.filter((question) => {
      if (roundNo !== 'all' && question.roundNo !== roundNo) return false
      if (teamId !== 'all' && question.teamId !== teamId) return false
      return true
    })
  }, [history, roundNo, teamId])

  if (!history) {
    return <div className="app-shell text-first-03">{error ?? '正在读取记录…'}</div>
  }

  const rounds = [...new Set(history.turns.map((turn) => turn.roundNo))]

  return (
    <PageShell title={history.name} subtitle={`${history.statusLabel} · ${history.outcomeLabel}`}>
      <div className="mb-6 flex flex-wrap gap-3">
        <Button onClick={() => void exportWorkbook()}>导出成绩 Excel</Button>
        <Button asChild variant="secondary">
          <Link to={`/session/${gameId}`}>打开比赛</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/history">返回列表</Link>
        </Button>
      </div>
      {exportNote ? <p className="mb-4 text-sm text-first-03">{exportNote}</p> : null}
      <div className="mb-6 grid gap-3 text-sm md:grid-cols-4">
        <Info label="状态" value={`${history.status} / ${history.statusLabel}`} />
        <Info label="结束原因" value={history.endReason ?? '—'} />
        <Info
          label="计划 / 正常完成 / 未进行"
          value={`${history.plannedTurnCount} / ${history.finishedTurnCount} / ${history.notPlayedTurnCount}`}
        />
        <Info label="授予冠军" value={history.showChampion ? '是' : '否'} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">队伍</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {history.teams.map((team) => {
            const champion = history.showChampion && team.rank === 1
            return (
              <div
                key={team.id}
                className={cn(
                  'rounded-[16px] border px-4 py-3',
                  champion ? 'border-gold bg-elevated' : 'border-line bg-surface'
                )}
                style={{ boxShadow: `inset 3px 0 0 ${team.color}` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span>
                    第 {team.rank} 名 · {team.name}
                    {champion ? (
                      <span className="ml-2 text-xs tracking-[0.14em] text-gold">冠军</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'text-2xl font-semibold tabular-nums',
                      champion ? 'text-gold' : 'text-morning'
                    )}
                  >
                    {team.totalScore}
                  </span>
                </div>
                <p className="mt-1 text-sm text-first-03">
                  正常完成 {team.finishedTurns} 次 · 未进行 {team.notPlayedTurns} 次
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">逐题</h2>
          <Select
            className="w-auto min-w-36"
            value={roundNo}
            onChange={(event) =>
              setRoundNo(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
          >
            <option value="all">全部轮次</option>
            {rounds.map((round) => (
              <option key={round} value={round}>
                第 {round} 轮
              </option>
            ))}
          </Select>
          <Select
            className="w-auto min-w-36"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
          >
            <option value="all">全部队伍</option>
            {history.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="gp-table-wrap">
          <table className="gp-table min-w-[760px]">
            <thead>
              <tr>
                <th>序号</th>
                <th>题目</th>
                <th>状态</th>
                <th>判定</th>
                <th>轮次</th>
                <th>队伍</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id}>
                  <td className="tabular-nums">{question.position}</td>
                  <td>{question.text}</td>
                  <td>{question.state}</td>
                  <td>{question.verdict ?? '—'}</td>
                  <td>{question.roundNo ?? '—'}</td>
                  <td>{question.teamName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">挑战排程</h2>
        <ul className="space-y-2 text-sm">
          {history.turns.map((turn) => (
            <li key={turn.id} className="rounded-[10px] border border-line bg-surface px-3 py-2">
              第 {turn.roundNo} 轮 · {turn.teamName} · {turn.status}
              {turn.endReason ? ` · ${turn.endReason}` : ''} · 得分 {turn.turnScore}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">判定事件</h2>
        <ul className="space-y-2 text-sm">
          {history.events.map((row) => (
            <li key={row.id} className="rounded-[10px] border border-line bg-surface px-3 py-2">
              {row.occurredAt.slice(11, 19)} · {row.action} · {row.questionText ?? '无题目'} · 分数{' '}
              {row.scoreDelta}
              {row.reason ? ` · ${row.reason}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">分数修正</h2>
        {history.adjustments.length === 0 ? (
          <p className="text-sm text-first-03">没有人工修分记录。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.adjustments.map((row) => (
              <li key={row.id} className="rounded-[10px] border border-line bg-surface px-3 py-2">
                {row.teamName} {row.previousTeamScore} → {row.newTeamScore} · {row.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )

  async function exportWorkbook(): Promise<void> {
    setExportNote(null)
    try {
      const result = await window.gameAPI.games.exportResults(gameId)
      setExportNote(result.saved ? `已保存 ${result.path ?? ''}` : '已取消导出')
    } catch (reason) {
      setExportNote(reason instanceof Error ? reason.message : '导出失败')
    }
  }
}

function Info({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-[16px] border border-line bg-surface px-3 py-3">
      <div className="text-xs tracking-[0.08em] text-first-03 uppercase">{label}</div>
      <div className="mt-1 text-morning">{value}</div>
    </div>
  )
}
