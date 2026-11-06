import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GameSnapshot } from '@shared/schemas/games'
import type { TeamRoster } from '@shared/schemas/roster'
import {
  globalPlayOrderByGroupNo,
  participatingGroupsSorted,
  playOrderName,
  sortGroupsByMemberCountDesc
} from '@shared/schemas/roster'
import { pickPreferredQuestionBankId } from '@shared/question-bank-defaults'
import type { QuestionBankSummary } from '@shared/schemas/questions'
import {
  clampTurnDurationSec,
  TURN_DURATION_SEC_MAX,
  TURN_DURATION_SEC_MIN,
  TURN_DURATION_SEC_STEP
} from '@shared/constants'
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
      const preferredId = pickPreferredQuestionBankId(list)
      if (!preferredId) return
      if (!currentBankId || !list.some((bank) => bank.id === currentBankId)) {
        useGameSetupStore.getState().setBankId(preferredId)
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
              activeOnly: true,
              unusedOnly: true
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

  const participatingGroups = store.participatingGroupNumbers
  const participatingCount = participatingGroups.length
  const challengeCount = participatingCount

  const globalPlayOrder = useMemo(
    () => (roster ? globalPlayOrderByGroupNo(roster) : null),
    [roster]
  )

  const orderedParticipating = useMemo(() => {
    if (!roster || participatingGroups.length === 0) return []
    return participatingGroupsSorted(roster, participatingGroups)
  }, [roster, participatingGroups])

  const schedulePreview = useMemo(() => {
    if (!globalPlayOrder || orderedParticipating.length === 0) return ''
    return orderedParticipating
      .slice(0, 3)
      .map((group) => playOrderName(globalPlayOrder.get(group.group) ?? group.group))
      .join(' → ')
  }, [globalPlayOrder, orderedParticipating])

  const validateBeforeConfirm = (): string | null => {
    if (!store.bankId) return '请选择题库'
    if (store.categoryFilter.length === 0) return '至少选择一个分类'
    if (availableCount < 1) return '没有未出过的题目，请补充新词或选择其他分类'
    if (!roster) return '分组名单尚未加载'
    if (participatingCount < 1) return '请勾选至少一组本批参赛'
    return null
  }

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
        turnDurationSec: store.turnDurationSec,
        scoreMode: 'UNIFORM',
        participatingGroupNumbers: participatingGroups
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
    <PageShell title="比赛配置" subtitle="Genpact China Digital · 固定分组 · 创建时冻结题目队列">
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
              组名、出场顺序和颜色在创建时冻结，不能在这里修改。先按人数从多到少排序，再依次称为第 1 组、第 2 组……不会写回分组 JSON。
            </p>
          </Card>
          {roster ? (
            <RosterPanels roster={roster} variant="members" />
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
            <div>
              <label className="text-sm text-first-03">挑战时长（秒）</label>
              <DurationField />
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

          {roster ? (
            <Card className="space-y-4">
              <CardTitle>本批参赛组别</CardTitle>
              <p className="text-sm text-first-03">
                默认不选组；勾选后这些组才进入本场挑战顺序，未勾选的组本场不排队。可分批创建多场比赛。
              </p>
              <div className="flex flex-wrap gap-2">
                {[...sortGroupsByMemberCountDesc(roster.groups)].map((group, index) => {
                    const checked = participatingGroups.includes(group.group)
                    return (
                      <label
                        key={group.group}
                        className="flex cursor-pointer items-center gap-2 rounded-full border border-first-01 bg-elevated px-3 py-2 text-sm text-morning has-[:checked]:border-coral has-[:checked]:bg-coral/10"
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-coral"
                          checked={checked}
                          onChange={() => store.toggleParticipatingGroup(group.group)}
                        />
                        {playOrderName(index + 1)}
                      </label>
                    )
                  })}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    store.setParticipatingGroupsAll(roster.groups.map((group) => group.group))
                  }
                >
                  全选
                </Button>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <StatPill label="挑战场次" value={String(challengeCount)} />
            <StatPill label="未出过的题目" value={availableCount} />
          </div>
          <p className="text-sm text-first-03">
            本批顺序预览：{schedulePreview || '—'}
            {participatingCount > 3 ? ' …' : ''} · 每场一轮
          </p>
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
            <DialogTitle>确认创建比赛</DialogTitle>
            <DialogDescription>
              本批 {participatingCount} 场挑战，每场 {store.turnDurationSec} 秒。名单顺序与左侧一致；创建后本批内再依次编号为第
              1 组起，冻结后不可改队列。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-[12px] border border-line bg-surface p-3 text-sm">
            {globalPlayOrder
              ? orderedParticipating.map((group) => (
                  <li key={group.group} className="text-first-03">
                    {playOrderName(globalPlayOrder.get(group.group) ?? group.group)} ·{' '}
                    {group.members.length} 人
                  </li>
                ))
              : null}
          </ul>
          <DialogFooter>
            <Button variant="secondary" disabled={creating} onClick={() => setConfirmOpen(false)}>
              返回修改
            </Button>
            <Button disabled={creating} onClick={() => void runCreate()}>
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
