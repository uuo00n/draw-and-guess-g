import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { PageShell, StatPill } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'

export function HomePage(): React.JSX.Element {
  const [activeQuestions, setActiveQuestions] = useState(0)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.gameAPI.app.getHomeSummary().then((summary) => {
      setActiveQuestions(summary.activeQuestionCount)
      setVersion(summary.version)
    })
  }, [])

  return (
    <PageShell title="DRAW & GUESS" subtitle="Team Challenge · 你画我猜">
      <div className="grid flex-1 gap-8 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col justify-between gap-8">
          <div>
            <CardTitle>创建新比赛</CardTitle>
            <CardDescription className="mt-2">
              导入题库、配置 2–12 支队伍，并在创建时冻结题目快照与洗牌队列。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/setup">创建新比赛</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/questions">题库管理</Link>
            </Button>
          </div>
        </Card>
        <div className="grid gap-4">
          <StatPill label="有效题目" value={activeQuestions} />
          <StatPill label="版本" value={version || '—'} />
          <p className="text-sm text-brand-muted">
            单屏公开出题 · 本地 SQLite · 完全离线。下一批将实现挑战大屏与权威计时。
          </p>
        </div>
      </div>
    </PageShell>
  )
}
