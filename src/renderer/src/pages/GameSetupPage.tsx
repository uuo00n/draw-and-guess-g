import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameSnapshot } from '@shared/schemas/games'
import type { QuestionBankSummary } from '@shared/schemas/questions'
import {
  clampTurnDurationSec,
  ROUND_COUNT_MAX,
  ROUND_COUNT_MIN,
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  TURN_DURATION_SEC_MAX,
  TURN_DURATION_SEC_MIN,
  TURN_DURATION_SEC_STEP
} from '@shared/constants'
import { PageShell, StatPill } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { StatusNote } from '@renderer/components/ui/status-note'
import { useGameSetupStore } from '@renderer/stores/game-setup-store'

function DurationField(): React.JSX.Element {
  const seconds = useGameSetupStore((state) => state.turnDurationSec)
  const setSeconds = useGameSetupStore((state) => state.setTurnDurationSec)
  const [text, setText] = useState(String(seconds))
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setText(String(seconds))
  }, [seconds])

  const commit = (raw: string): void => {
    const parsed = Number.parseInt(raw, 10)
    const next = Number.isFinite(parsed) ? clampTurnDurationSec(parsed) : seconds
    setSeconds(next)
    setText(String(next))
  }

  const stepBy = (direction: -1 | 1): void => {
    const current = useGameSetupStore.getState().turnDurationSec
    setSeconds(current + direction * TURN_DURATION_SEC_STEP)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="减少 10 秒"
        disabled={seconds <= TURN_DURATION_SEC_MIN}
        onClick={() => stepBy(-1)}
      >
        −
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        aria-label="挑战时长（秒）"
        min={TURN_DURATION_SEC_MIN}
        max={TURN_DURATION_SEC_MAX}
        value={text}
        onFocus={() => {
          editing.current = true
        }}
        onChange={(event) => {
          const raw = event.target.value.replace(/[^\d]/g, '')
          setText(raw)
          const parsed = Number.parseInt(raw, 10)
          if (
            Number.isFinite(parsed) &&
            parsed >= TURN_DURATION_SEC_MIN &&
            parsed <= TURN_DURATION_SEC_MAX
          ) {
            setSeconds(parsed)
          }
        }}
        onBlur={() => {
          editing.current = false
          commit(text)
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="增加 10 秒"
        disabled={seconds >= TURN_DURATION_SEC_MAX}
        onClick={() => stepBy(1)}
      >
        +
      </Button>
    </div>
  )
}

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
    <PageShell title="比赛配置" subtitle="Genpact Dalian Digital · 队伍 2–12 · 创建时冻结题目队列">
      <div className="mb-4">
        <Button asChild variant="ghost">
          <Link to="/">返回首页</Link>
        </Button>
      </div>

      {error ? (
        <StatusNote tone="danger" className="mb-4">
          {error}
        </StatusNote>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-6">
          <div>
            <CardTitle>队伍配置</CardTitle>
            <CardDescription className="mt-1">
              名称非空且不可重复。颜色和出场顺序在创建时冻结。
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-first-03">队伍数</span>
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
              onChange={(e) =>
                store.setTeamCount(Number.parseInt(e.target.value, 10) || TEAM_COUNT_MIN)
              }
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
                className="grid gap-3 rounded-[12px] border border-line bg-midnight/40 p-3 md:grid-cols-[1fr_auto_auto_auto]"
                style={{ boxShadow: `inset 3px 0 0 ${team.color}` }}
              >
                <Input
                  value={team.name}
                  aria-label={`队伍 ${index + 1} 名称`}
                  onChange={(e) => store.updateTeam(index, { name: e.target.value })}
                />
                <input
                  type="color"
                  value={team.color}
                  onChange={(e) => store.updateTeam(index, { color: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded-[10px] border border-first-01 bg-transparent"
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

        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Card className="space-y-4">
            <CardTitle>规则与题库</CardTitle>
            <label className="block text-sm text-first-03">题库</label>
            <Select value={store.bankId ?? ''} onChange={(e) => store.setBankId(e.target.value)}>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}（{bank.activeQuestionCount} 题）
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-first-03">轮数</label>
                <Input
                  type="number"
                  min={ROUND_COUNT_MIN}
                  max={ROUND_COUNT_MAX}
                  value={store.roundCount}
                  onChange={(e) => store.setRoundCount(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <label className="text-sm text-first-03">挑战时长（秒）</label>
                <DurationField />
              </div>
            </div>
            {categories.length > 0 ? (
              <div>
                <p className="mb-2 text-sm text-first-03">分类筛选（可选）</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const active = store.categoryFilter.includes(cat)
                    return (
                      <button
                        key={cat}
                        type="button"
                        data-active={active ? 'true' : 'false'}
                        onClick={() => store.toggleCategory(cat)}
                        className="gp-chip"
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
            <StatPill
              label="挑战场次"
              value={`${store.teamCount} × ${store.roundCount} = ${challengeCount}`}
            />
            <StatPill label="可用题目" value={availableCount} />
          </div>
          <p className="text-sm text-first-03">顺序预览：{schedulePreview} … 每轮重复</p>
          <Button size="lg" className="w-full" onClick={() => void onCreate()}>
            创建并冻结题目队列
          </Button>
        </div>
      </div>

      {created ? (
        <Card className="mt-8 border-gold/50">
          <CardTitle>已创建 · {created.name}</CardTitle>
          <CardDescription className="mt-2">
            状态 {created.status} · 队列 {created.queueSize} 题 · 计划挑战{' '}
            {created.plannedTurnCount} 场 · 首场 {created.turns[0]?.status}
          </CardDescription>
          <Button asChild className="mt-4">
            <Link to={`/session/${created.id}`}>进入准备页</Link>
          </Button>
          <ol className="mt-4 max-h-48 space-y-1 overflow-auto text-sm text-first-03">
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
