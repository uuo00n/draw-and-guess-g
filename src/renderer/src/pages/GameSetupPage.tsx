import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameSnapshot } from '@shared/schemas/games'
import type { QuestionBankSummary } from '@shared/schemas/questions'
import {
  ROUND_COUNT_MAX,
  ROUND_COUNT_MIN,
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  TURN_DURATION_MS_MAX,
  TURN_DURATION_MS_MIN
} from '@shared/constants'
import { PageShell, StatPill } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { useGameSetupStore } from '@renderer/stores/game-setup-store'

export function GameSetupPage(): React.JSX.Element {
  const store = useGameSetupStore()
  const [banks, setBanks] = useState<QuestionBankSummary[]>([])
  const [availableCount, setAvailableCount] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [created, setCreated] = useState<GameSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.gameAPI.questions.listBanks().then((list) => {
      setBanks(list)
      const currentBankId = useGameSetupStore.getState().bankId
      if (!currentBankId && list[0]) {
        useGameSetupStore.getState().setBankId(list[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!store.bankId) {
      setAvailableCount(0)
      setCategories([])
      return
    }
    const bankId = store.bankId
    const categoriesSelected = store.categoryFilter
    let cancelled = false
    void (async () => {
      try {
        const page = await window.gameAPI.questions.list({
          bankId,
          page: 1,
          pageSize: 1,
          activeOnly: true
        })
        if (cancelled) return
        setCategories(page.categories)
        if (categoriesSelected.length === 0) {
          setAvailableCount(page.total)
          return
        }
        const counts = await Promise.all(
          categoriesSelected.map((category) =>
            window.gameAPI.questions.list({
              bankId,
              category,
              page: 1,
              pageSize: 1,
              activeOnly: true
            })
          )
        )
        if (cancelled) return
        setAvailableCount(counts.reduce((sum, result) => sum + result.total, 0))
      } catch (e) {
        if (!cancelled) {
          setAvailableCount(0)
          setError((e as Error).message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store.bankId, store.categoryFilter])

  const challengeCount = store.teamCount * store.roundCount

  const schedulePreview = useMemo(
    () =>
      store.teams
        .slice(0, 3)
        .map((t) => t.name)
        .join(' → '),
    [store.teams]
  )

  const onCreate = async (): Promise<void> => {
    setError(null)
    setCreated(null)
    if (!store.bankId) {
      setError('请选择题库')
      return
    }
    if (availableCount < 1) {
      setError('可用题目不足，无法创建比赛')
      return
    }
    try {
      const snapshot = await window.gameAPI.games.create({
        bankId: store.bankId,
        categoryFilter: store.categoryFilter.length ? store.categoryFilter : undefined,
        roundCount: store.roundCount,
        turnDurationSec: store.turnDurationSec,
        scoreMode: 'UNIFORM',
        teams: store.teams.map((team) => ({
          name: team.name,
          color: team.color,
          sortOrder: team.sortOrder
        }))
      })
      setCreated(snapshot)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <PageShell title="新建比赛" subtitle="队伍 2–12 · 轮次 1–5 · 创建时冻结题目队列">
      <div className="mb-4 flex gap-3">
        <Button asChild variant="ghost">
          <Link to="/">返回首页</Link>
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-brand-accent-strong/40 bg-brand-accent-strong/10 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-6">
          <div>
            <CardTitle>队伍配置</CardTitle>
            <CardDescription className="mt-1">名称非空且不可重复，可调整颜色与顺序</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-muted">队伍数</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => store.setTeamCount(store.teamCount - 1)}
              disabled={store.teamCount <= TEAM_COUNT_MIN}
            >
              −
            </Button>
            <Input
              type="number"
              min={TEAM_COUNT_MIN}
              max={TEAM_COUNT_MAX}
              value={store.teamCount}
              onChange={(e) => store.setTeamCount(Number.parseInt(e.target.value, 10) || TEAM_COUNT_MIN)}
              className="w-20 text-center"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => store.setTeamCount(store.teamCount + 1)}
              disabled={store.teamCount >= TEAM_COUNT_MAX}
            >
              +
            </Button>
          </div>
          <div className="space-y-3">
            {store.teams.map((team, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-brand-muted/15 bg-brand-bg/30 p-3 md:grid-cols-[1fr_auto_auto_auto]"
              >
                <Input
                  value={team.name}
                  onChange={(e) => store.updateTeam(index, { name: e.target.value })}
                />
                <input
                  type="color"
                  value={team.color}
                  onChange={(e) => store.updateTeam(index, { color: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded border border-brand-muted/20 bg-transparent"
                  aria-label={`队伍 ${index + 1} 颜色`}
                />
                <Button variant="secondary" size="sm" onClick={() => store.moveTeam(index, -1)}>
                  上移
                </Button>
                <Button variant="secondary" size="sm" onClick={() => store.moveTeam(index, 1)}>
                  下移
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <CardTitle>规则与题库</CardTitle>
            <label className="block text-sm text-brand-muted">题库</label>
            <select
              className="w-full rounded-md border border-brand-muted/30 bg-brand-surface px-3 py-2 text-sm"
              value={store.bankId ?? ''}
              onChange={(e) => store.setBankId(e.target.value)}
            >
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}（{bank.activeQuestionCount} 题）
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-brand-muted">轮数</label>
                <Input
                  type="number"
                  min={ROUND_COUNT_MIN}
                  max={ROUND_COUNT_MAX}
                  value={store.roundCount}
                  onChange={(e) => store.setRoundCount(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <label className="text-sm text-brand-muted">挑战时长（秒）</label>
                <Input
                  type="number"
                  min={TURN_DURATION_MS_MIN / 1000}
                  max={TURN_DURATION_MS_MAX / 1000}
                  value={store.turnDurationSec}
                  onChange={(e) =>
                    store.setTurnDurationSec(Number.parseInt(e.target.value, 10) || 60)
                  }
                />
              </div>
            </div>
            {categories.length > 0 ? (
              <div>
                <p className="mb-2 text-sm text-brand-muted">分类筛选（可选）</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const active = store.categoryFilter.includes(cat)
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => store.toggleCategory(cat)}
                        className={`rounded-full px-3 py-1 text-xs ${
                          active
                            ? 'bg-brand-accent text-brand-bg'
                            : 'border border-brand-muted/30 text-brand-muted'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatPill label="挑战场次" value={`${store.teamCount} × ${store.roundCount} = ${challengeCount}`} />
            <StatPill label="可用题目" value={availableCount} />
          </div>
          <p className="text-sm text-brand-muted">顺序预览：{schedulePreview} … 每轮重复</p>
          <Button size="lg" className="w-full" onClick={() => void onCreate()}>
            创建并冻结题目队列
          </Button>
        </div>
      </div>

      {created ? (
        <Card className="mt-8 border-brand-accent/40">
          <CardTitle>已创建 · {created.name}</CardTitle>
          <CardDescription className="mt-2">
            状态 {created.status} · 队列 {created.queueSize} 题 · 计划挑战 {created.plannedTurnCount}{' '}
            场 · 首场 {created.turns[0]?.status}
          </CardDescription>
          <Button asChild className="mt-4">
            <Link to={`/session/${created.id}`}>进入准备页</Link>
          </Button>
          <ol className="mt-4 max-h-48 overflow-auto text-sm text-brand-muted">
            {created.turns.slice(0, 12).map((turn) => {
              const team = created.teams.find((t) => t.id === turn.teamId)
              return (
                <li key={turn.id}>
                  #{turn.sequenceNo} 轮次 {turn.roundNo} · {team?.name} · {turn.status}
                </li>
              )
            })}
          </ol>
        </Card>
      ) : null}
    </PageShell>
  )
}
