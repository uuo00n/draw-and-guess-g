import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HistoryListItem, HistoryQuery } from '@shared/schemas/history'
import { PageShell } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { StatusNote } from '@renderer/components/ui/status-note'
import { cn } from '@renderer/lib/utils'

const FILTERS = [
  { id: '', label: '全部' },
  { id: 'GAME_ACTIVE', label: '进行中' },
  { id: 'GAME_READY', label: '未开始' },
  { id: 'GAME_FINISHED', label: '正常结束' },
  { id: 'GAME_FINISHED_EARLY', label: '提前结束' },
  { id: 'GAME_ABORTED', label: '已中止' }
] as const

function statusClass(status: string): string {
  if (status === 'GAME_FINISHED') return 'text-gold'
  if (status === 'GAME_ACTIVE') return 'text-coral'
  if (status === 'GAME_ABORTED') return 'text-danger'
  return 'text-first-03'
}

export function HistoryPage(): React.JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<HistoryQuery['status']>()
  const [rows, setRows] = useState<HistoryListItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.gameAPI.games
      .listHistory({ keyword: keyword.trim() || undefined, status })
      .then(setRows)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '无法读取历史')
      )
  }, [keyword, status])

  return (
    <PageShell title="历史比赛" subtitle="按日期倒序。提前结束和中止不显示冠军。">
      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          value={keyword}
          placeholder="搜索赛事名称"
          onChange={(event) => setKeyword(event.target.value)}
          className="max-w-xs"
        />
        {FILTERS.map((filter) => (
          <Button
            key={filter.id || 'all'}
            variant={
              status === filter.id || (!status && filter.id === '') ? 'default' : 'secondary'
            }
            onClick={() => setStatus(filter.id === '' ? undefined : filter.id)}
          >
            {filter.label}
          </Button>
        ))}
        <Button asChild variant="ghost">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
      {error ? (
        <StatusNote tone="danger" className="mb-4">
          {error}
        </StatusNote>
      ) : null}
      <div className="gp-table-wrap">
        <table className="gp-table min-w-[880px]">
          <thead>
            <tr>
              <th>赛事</th>
              <th>日期</th>
              <th>状态</th>
              <th>队伍</th>
              <th>轮数</th>
              <th>已用题</th>
              <th>结果</th>
              <th>总分</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link
                    to={`/history/${row.id}`}
                    className="font-semibold text-coral hover:text-coral-hover"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="tabular-nums">{row.createdAt.slice(0, 16)}</td>
                <td className={cn(statusClass(row.status))}>
                  {row.statusLabel}
                  {row.activityLabel ? ` · ${row.activityLabel}` : ''}
                </td>
                <td className="tabular-nums">{row.teamCount}</td>
                <td className="tabular-nums">{row.roundCount}</td>
                <td className="tabular-nums">{row.usedQuestionCount}</td>
                <td>{row.outcomeLabel}</td>
                <td className="tabular-nums text-gold">{row.scoreTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="mt-6 text-first-03">没有符合条件的比赛。</p> : null}
    </PageShell>
  )
}
