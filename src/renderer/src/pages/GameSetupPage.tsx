import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GameSnapshot } from '@shared/schemas/games'
import type { TeamRoster } from '@shared/schemas/roster'
import { groupDisplayName } from '@shared/schemas/roster'
import type { QuestionBankSummary } from '@shared/schemas/questions'
import {
  clampTurnDurationSec,
  ROUND_COUNT_MAX,
  ROUND_COUNT_MIN,
  TURN_DURATION_SEC_MAX,
  TURN_DURATION_SEC_MIN,
  TURN_DURATION_SEC_STEP
} from '@shared/constants'
import {
  formatMissingPerformerMessage,
  groupsMissingPerformer
} from '@shared/roster-performers'
import { normalizeMemberName } from '@shared/normalize'
import { PageShell, StatPill } from '@renderer/components/layout/AppShell'
import { RosterPanels } from '@renderer/components/roster/RosterPanels'
import { Button } from '@renderer/components/ui/button'
import { Card, CardTitle } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
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
  const navigate = useNavigate()
  const store = useGameSetupStore()
  const [banks, setBanks] = useState<QuestionBankSummary[]>([])
  const [roster, setRoster] = useState<TeamRoster | null>(null)
  const [availableCount, setAvailableCount] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createLocked, setCreateLocked] = useState(false)
  const [created, setCreated] = useState<GameSnapshot | null>(null)
  const pendingCommandId = useRef<string | null>(null)

  useEffect(() => {
    void window.gameAPI.questions.listBanks().then((list) => {
      setBanks(list)
      const currentBankId = useGameSetupStore.getState().bankId
      if (!currentBankId && list[0]) {
        useGameSetupStore.getState().setBankId(list[0].id)
      }
    })
    void window.gameAPI.app.getRoster().then(setRoster).catch(() => setRoster(null))
  }, [])

  useEffect(() => {
    if (!store.bankId) {
      setAvailableCount(0)
      setCategories([])
      return
    }
    const bankId = store.bankId
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
        const currentFilter = useGameSetupStore.getState().categoryFilter
        if (currentFilter.length === 0 && page.categories.length > 0) {
          useGameSetupStore.getState().setCategoryFilterAll(page.categories)
        }
      } catch (e) {
        if (!cancelled) {
          setCategories([])
          setError((e as Error).message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store.bankId])

  useEffect(() => {
    if (!store.bankId || store.categoryFilter.length === 0) {
      setAvailableCount(0)
      return
    }
    const bankId = store.bankId
    const categoriesSelected = store.categoryFilter
    let cancelled = false
    void (async () => {
      try {
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

  const groupCount = roster?.groupCount ?? 0
  const challengeCount = groupCount * store.roundCount

  const schedulePreview = useMemo(() => {
    if (!roster) return ''
    return [...roster.groups]
      .sort((a, b) => a.group - b.group)
      .slice(0, 3)
      .map((group) => groupDisplayName(group.group))
      .join(' → ')
  }, [roster])

  const validateBeforeConfirm = (): string | null => {
    if (!store.bankId) return '请选择题库'
    if (store.categoryFilter.length === 0) return '至少选择一个分类'
    if (availableCount < 1) return '可用题目不足，无法创建比赛'
    if (!roster) return '分组名单尚未加载'
    return null
  }

  const performerAudit = useMemo(() => {
    if (!roster) return []
    const performers = new Set(store.performerMembers.map((name) => normalizeMemberName(name)))
    return [...roster.groups]
      .sort((a, b) => a.group - b.group)
      .map((group) => {
        const performer =
          group.members.find((member) => performers.has(normalizeMemberName(member))) ?? null
        return { groupNo: group.group, performer }
      })
  }, [roster, store.performerMembers])

  const missingPerformerGroups = roster
    ? groupsMissingPerformer(roster, store.performerMembers)
    : []

  const openConfirm = (): void => {
    setError(null)
    const message = validateBeforeConfirm()
    if (message) {
      setError(message)
      return
    }
    pendingCommandId.current = crypto.randomUUID()
    setConfirmOpen(true)
  }

  const runCreate = async (): Promise<void> => {
    if (creating || !store.bankId || !pendingCommandId.current) return
    setCreating(true)
    setError(null)
    try {
      const snapshot = await window.gameAPI.games.create({
        commandId: pendingCommandId.current,
        bankId: store.bankId,
        categoryFilter: store.categoryFilter,
        roundCount: store.roundCount,
        turnDurationSec: store.turnDurationSec,
        scoreMode: 'UNIFORM',
        performerMembers: store.performerMembers
      })
      setCreated(snapshot)
      setConfirmOpen(false)
      setSuccessOpen(true)
      setCreateLocked(true)
    } catch (e) {
      setConfirmOpen(false)
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const closeSuccess = (): void => {
    setSuccessOpen(false)
    setCreateLocked(false)
    pendingCommandId.current = null
  }

  return (
    <PageShell title="比赛配置" subtitle="Genpact Dalian Digital · 固定分组 · 创建时冻结题目队列">
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
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <CardTitle>人员名单</CardTitle>
            <p className="text-sm text-first-03">
              组名、出场顺序和颜色在创建时冻结，不能在这里修改。点击成员可标记「表演题目」（每组最多一位），不会写回分组 JSON。
            </p>
          </Card>
          {roster ? (
            <RosterPanels
              roster={roster}
              variant="members"
              performerMembers={store.performerMembers}
              onTogglePerformer={(member, groupMembers) =>
                store.togglePerformer(member, groupMembers)
              }
            />
          ) : (
            <p className="text-sm text-first-03">正在加载分组…</p>
          )}
        </div>

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
                <p className="mb-2 text-sm text-first-03">分类筛选</p>
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
              value={`${groupCount} × ${store.roundCount} = ${challengeCount}`}
            />
            <StatPill label="可用题目" value={availableCount} />
          </div>
          <p className="text-sm text-first-03">顺序预览：{schedulePreview} … 每轮重复</p>
          <Button
            size="lg"
            className="w-full"
            disabled={createLocked || creating}
            onClick={openConfirm}
          >
            创建并冻结题目队列
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          onPointerDownOutside={(event) => {
            if (creating) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (creating) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>审核表演题目人员</DialogTitle>
            <DialogDescription>
              {groupCount} 组 × {store.roundCount} 轮 = {challengeCount} 场挑战，每场{' '}
              {store.turnDurationSec} 秒。请确认每组都已勾选表演题目人员后再冻结队列。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-[12px] border border-line bg-surface p-3 text-sm">
            {performerAudit.map((row) => {
              const missing = missingPerformerGroups.includes(row.groupNo)
              return (
                <li
                  key={row.groupNo}
                  className={missing ? 'text-coral' : 'text-first-03'}
                >
                  {groupDisplayName(row.groupNo)}：
                  {row.performer ? `${row.performer}（表演题目）` : '未勾选'}
                </li>
              )
            })}
          </ul>
          {missingPerformerGroups.length > 0 ? (
            <StatusNote tone="danger">
              {formatMissingPerformerMessage(roster!, missingPerformerGroups)}
            </StatusNote>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={creating} onClick={() => setConfirmOpen(false)}>
              返回修改
            </Button>
            <Button
              disabled={creating || missingPerformerGroups.length > 0}
              onClick={() => void runCreate()}
            >
              {creating ? '正在创建…' : '确认创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={successOpen}
        onOpenChange={(open) => {
          if (!open) closeSuccess()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>已创建 · {created?.name}</DialogTitle>
            <DialogDescription>
              状态 {created?.status} · 队列 {created?.queueSize} 题 · 计划挑战{' '}
              {created?.plannedTurnCount} 场 · 首场 {created?.turns[0]?.status}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={closeSuccess}>
              关闭
            </Button>
            <Button
              onClick={() => {
                if (created) navigate(`/session/${created.id}`)
              }}
            >
              进入准备页
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
