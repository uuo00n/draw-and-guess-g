import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { TeamRoster } from '@shared/schemas/roster'
import { PageShell } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { RosterPanels } from '@renderer/components/roster/RosterPanels'

export function TeamGroupingPage(): React.JSX.Element {
  const [roster, setRoster] = useState<TeamRoster | null>(null)

  useEffect(() => {
    void window.gameAPI.app.getRoster().then(setRoster).catch(() => setRoster(null))
  }, [])

  return (
    <PageShell title="比赛分组" subtitle="Genpact China Digital · 只读查看当前分组与规则">
      <div className="mb-4">
        <Button asChild variant="ghost">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
      {roster ? <RosterPanels roster={roster} /> : <p className="text-sm text-first-03">正在加载分组…</p>}
    </PageShell>
  )
}
