import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HistoryListItem, HistoryQuery } from '@shared/schemas/history'
import { PageShell } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

const FILTERS = [
  { id: '', label: '全部' },
  { id: 'GAME_ACTIVE', label: '进行中' },
  { id: 'GAME_READY', label: '未开始' },
  { id: 'GAME_FINISHED', label: '正常结束' },
  { id: 'GAME_FINISHED_EARLY', label: '提前结束' },
  { id: 'GAME_ABORTED', label: '已中止' }
] as const

export function HistoryPage(): React.JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<HistoryQuery['status']>()
  const [rows, setRows] = useState<HistoryListItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.gameAPI.games
      .listHistory({ keyword: keyword.trim() || undefined, status })
      .then(setRows)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '无法读取历史'))
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
            variant={status === filter.id || (!status && filter.id === '') ? 'default' : 'secondary'}
            onClick={() => setStatus(filter.id === '' ? undefined : filter.id)}
          >
            {filter.label}
          </Button>
        ))}
        <Button asChild variant="ghost">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
      {error ? <p className="mb-4 text-brand-accent-strong">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="text-brand-muted">
            <tr>
              <th className="border-b border-brand-muted/20 px-3 py-2">赛事</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">日期</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">状态</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">队伍</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">轮数</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">已用题</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">结果</th>
              <th className="border-b border-brand-muted/20 px-3 py-2">总分</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-brand-muted/10 px-3 py-3">
                  <Link to={`/history/${row.id}`} className="text-brand-accent">
                    {row.name}
                  </Link>
                </td>
                <td className="border-b border-brand-muted/10 px-3 py-3">{row.createdAt.slice(0, 16)}</td>
                <td className="border-b border-brand-muted/10 px-3 py-3">
                  {row.statusLabel}
                  {row.activityLabel ? ` · ${row.activityLabel}` : ''}
                </td>
                <td className="border-b border-brand-muted/10 px-3 py-3">{row.teamCount}</td>
                <td className="border-b border-brand-muted/10 px-3 py-3">{row.roundCount}</td>
                <td className="border-b border-brand-muted/10 px-3 py-3">{row.usedQuestionCount}</td>
                <td className="border-b border-brand-muted/10 px-3 py-3">{row.outcomeLabel}</td>
                <td className="border-b border-brand-muted/10 px-3 py-3">{row.scoreTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="mt-6 text-brand-muted">没有符合条件的比赛。</p> : null}
      </div>
    </PageShell>
  )
}
