import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { GameCommandResult, PlaySnapshot } from '@shared/schemas/play'
import { GenpactBrand } from '@renderer/components/branding/GenpactBrand'
import { ScrollablePageRoot } from '@renderer/components/layout/AppShell'
import { TeamScoreStrip } from '@renderer/components/TeamScoreStrip'
import { CountdownRing } from '@renderer/components/CountdownRing'
import { TurnReadyCountdown } from '@renderer/components/TurnReadyCountdown'
import { ScoreValue } from '@renderer/components/ScoreValue'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { StatusNote } from '@renderer/components/ui/status-note'
import { useGameSnapshot } from '@renderer/hooks/useGameSnapshot'
import { useTurnClock } from '@renderer/hooks/useTurnClock'
import { ChampionMark, useSessionEffects } from '@renderer/hooks/useSessionEffects'
import { useUiSettings } from '@renderer/stores/ui-settings-store'
import { cn } from '@renderer/lib/utils'
import { TURN_SKIP_LIMIT } from '@shared/constants'
import { formatMembersDisplay } from '@renderer/lib/member-display'

function newCommandId(): string {
  return crypto.randomUUID()
}

export function GameSessionPage(): React.JSX.Element {
  const { gameId = '' } = useParams()
  const { snapshot, error, setSnapshot, setError } = useGameSnapshot(gameId)
  const [pending, setPending] = useState(false)
  const [abortArmed, setAbortArmed] = useState(false)
  const [startCountdown, setStartCountdown] = useState(false)
  const [resetTimerConfirmOpen, setResetTimerConfirmOpen] = useState(false)
  const displayRemainingMs = useTurnClock({
    turnId: snapshot?.currentTurn?.id ?? null,
    status: snapshot?.currentTurn?.status ?? null,
    authoritativeRemainingMs: snapshot?.currentTurn?.remainingMs ?? 0
  })
  const { championMark } = useSessionEffects(snapshot, displayRemainingMs)
  const muted = useUiSettings((state) => state.muted)
  const setMuted = useUiSettings((state) => state.setMuted)
  const startTurnAfterCountdown = useRef<(() => void) | null>(null)

  const run = async (action: () => Promise<GameCommandResult>): Promise<void> => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const result = await action()
      setSnapshot(result.snapshot)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setPending(false)
    }
  }

  const answer = (verdict: 'CORRECT' | 'SKIPPED'): Promise<void> => {
    if (!snapshot?.currentTurn || !snapshot.currentQuestion || !snapshot.canAnswer)
      return Promise.resolve()
    return run(() =>
      window.gameAPI.games.submitAnswer({
        commandId: newCommandId(),
        gameId,
        turnId: snapshot.currentTurn!.id,
        currentQueueItemId: snapshot.currentQuestion!.queueItemId,
        verdict
      })
    )
  }

  useEffect(() => {
    if (!snapshot) return
    const onKey = (event: KeyboardEvent): void => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.code === 'Space') {
        event.preventDefault()
        if (snapshot.canPause)
          void run(() => window.gameAPI.games.pause({ gameId, commandId: newCommandId() }))
        if (snapshot.canResume)
          void run(() => window.gameAPI.games.resume({ gameId, commandId: newCommandId() }))
      }
      if (event.key === 'Enter' && snapshot.canAnswer) {
        event.preventDefault()
        void answer('CORRECT')
      }
      if (event.key === 'ArrowRight' && snapshot.canSkip) {
        event.preventDefault()
        void answer('SKIPPED')
      }
      if (event.ctrlKey && (event.key === 'z' || event.key === 'Z') && snapshot.canUndo) {
        event.preventDefault()
        void run(() => window.gameAPI.games.undoLastAnswer({ gameId, commandId: newCommandId() }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snapshot, gameId, pending])

  useEffect(() => {
    if (!snapshot?.canResetTimer) setResetTimerConfirmOpen(false)
  }, [snapshot?.canResetTimer])

  if (!snapshot) {
    return <div className="app-shell session-shell text-first-03">{error ?? '正在读取比赛…'}</div>
  }

  const roundLabel = snapshot.currentTurn
    ? `第 ${snapshot.currentTurn.roundNo} / ${snapshot.roundCount} 轮`
    : `共 ${snapshot.roundCount} 轮`

  startTurnAfterCountdown.current = (): void => {
    void run(() => window.gameAPI.games.startTurn({ gameId, commandId: newCommandId() }))
  }

  return (
    <ScrollablePageRoot
      className="session-shell"
      scrollClassName="flex min-h-0 flex-col"
      header={
        <>
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <GenpactBrand variant="wordmark" height={60} />
              <span className="hidden h-7 w-px bg-first-01 sm:block" />
              <p className="min-w-0 text-sm text-first-03 sm:text-base">
                <span className="text-morning">Genpact Dalian Digital</span>
                <span className="mx-2 text-first-01">|</span>
                <span className="tracking-[0.12em] text-morning">DRAW &amp; GUESS</span>
                <span className="mx-2 text-first-01">|</span>
                <span className="text-gold">{roundLabel}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
              <Button variant="ghost" onClick={() => setMuted(!muted)}>
                {muted ? '已静音' : '音效开'}
              </Button>
              <Button variant="ghost" onClick={() => void window.gameAPI.app.toggleFullscreen()}>
                投影全屏
              </Button>
              <Link to={`/history/${gameId}`} className="px-2 text-coral hover:text-coral-hover">
                记录
              </Link>
              <Link to="/" className="px-2 text-first-03 hover:text-morning">
                返回首页
              </Link>
            </div>
          </header>

          {error ? (
            <StatusNote tone="danger" className="mb-3">
              {error}
            </StatusNote>
          ) : null}

          <TeamScoreStrip snapshot={snapshot} />
        </>
      }
    >
      <section className="mt-4 flex min-h-0 flex-1 flex-col">{renderPhase(snapshot)}</section>
      <TurnReadyCountdown
        active={startCountdown}
        onCancel={() => setStartCountdown(false)}
        onComplete={() => {
          setStartCountdown(false)
          startTurnAfterCountdown.current?.()
        }}
      />
      <Dialog open={resetTimerConfirmOpen} onOpenChange={setResetTimerConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确定要重置时间吗？</DialogTitle>
            <DialogDescription>
              将把 {snapshot.currentTurn?.teamName ?? '当前组'} 的剩余时间恢复为本场挑战的完整时长。
              已答题目与得分不会回退。确定要继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={pending} onClick={() => setResetTimerConfirmOpen(false)}>
              取消
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                void run(() =>
                  window.gameAPI.games.resetTurnTimer({ gameId, commandId: newCommandId() })
                ).then(() => setResetTimerConfirmOpen(false))
              }
            >
              确认重置时间
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollablePageRoot>
  )

  function renderPhase(current: PlaySnapshot): React.JSX.Element {
    if (current.phase === 'recovery') {
      return (
        <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold tracking-[0.22em] text-gold">RECOVERY REQUIRED</p>
          <h2 className="mt-3 text-3xl font-semibold">需要人工恢复</h2>
          <p className="mt-4 text-first-03">
            检测到 {current.recoveryReason}。已停止开始、判题和自动改分，分数保持原样。
          </p>
        </div>
      )
    }
    if (
      current.phase === 'final' ||
      current.phase === 'final-early' ||
      current.phase === 'aborted'
    ) {
      const title =
        current.phase === 'final'
          ? '最终排行榜'
          : current.phase === 'final-early'
            ? '当前积分榜（比赛提前结束）'
            : '比赛已中止'
      const celebrate = current.showChampion && Boolean(current.championTeamId)
      return (
        <div className={cn('mx-auto w-full max-w-3xl', celebrate && 'gp-award')}>
          <ChampionMark active={championMark && current.showChampion} />
          <p className="text-center text-xs font-semibold tracking-[0.22em] text-first-02">
            {celebrate ? 'TEAM CHALLENGE' : 'GENPACT DALIAN DIGITAL'}
          </p>
          <h2 className="mt-2 text-center text-4xl font-semibold">{title}</h2>
          {celebrate ? (
            <p className="mt-4 text-center text-3xl font-semibold text-gold">
              冠军{' '}
              {current.leaderboard.find((team) => team.teamId === current.championTeamId)?.name}
            </p>
          ) : current.scoreTiedForLead ? (
            <p className="mt-4 text-center text-xl font-semibold text-gold">分数并列，请双方加时。</p>
          ) : (
            <p className="mt-4 text-center text-first-03">本场不授予冠军</p>
          )}
          <ol className="mt-8 space-y-3">
            {current.leaderboard.map((team) => {
              const isChampion = celebrate && team.teamId === current.championTeamId
              return (
                <li
                  key={team.teamId}
                  className={cn(
                    'flex items-center justify-between rounded-[16px] border px-4 py-3',
                    isChampion ? 'border-gold bg-elevated' : 'border-line bg-surface'
                  )}
                  style={{ boxShadow: `inset 3px 0 0 ${team.color}` }}
                >
                  <span>
                    第 {team.rank} 名 · {team.name}
                  </span>
                  <span
                    className={cn(
                      'text-2xl font-semibold tabular-nums',
                      isChampion ? 'text-gold' : 'text-morning'
                    )}
                  >
                    <ScoreValue value={team.totalScore} />
                  </span>
                </li>
              )
            })}
          </ol>
          <div className="mt-8 flex flex-wrap justify-center gap-3 pb-2">
            <Button onClick={() => void window.gameAPI.games.exportResults(gameId)}>
              导出成绩
            </Button>
            <Button asChild variant="secondary">
              <Link to={`/history/${gameId}`}>查看详情</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">返回首页</Link>
            </Button>
          </div>
        </div>
      )
    }
    if (current.phase === 'ready') {
      const seconds = Math.round(current.turnDurationMs / 1000)
      const team = current.teams.find((item) => item.id === current.currentTurn?.teamId)
      const members = team?.members ?? []
      return (
        <div className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold tracking-[0.22em] text-gold">
            ROUND {current.currentTurn?.roundNo} / {current.roundCount}
          </p>
          <h2 className="mt-4 text-5xl font-semibold lg:text-6xl">
            下一位：{current.currentTurn?.teamName}
          </h2>
          {members.length > 0 ? (
            <p className="mt-4 max-w-3xl text-lg text-first-03">{formatMembersDisplay(members)}</p>
          ) : null}
          <p className="mt-4 text-first-03">准备页不展示题目。主持人确认后才开始计时。</p>
          <Button
            size="lg"
            className="mt-8"
            disabled={!current.canStart || pending || startCountdown}
            onClick={() => setStartCountdown(true)}
          >
            开始 {seconds} 秒挑战
          </Button>
          {abortBlock(current)}
        </div>
      )
    }
    if (current.phase === 'turn-result') {
      const turn = current.currentTurn
      return (
        <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center text-center">
          <h2 className="text-4xl font-semibold">{turn?.teamName} 本队结束</h2>
          <p className="mt-4 text-first-03">倒计时已停止。下一队需要主持人手动开始。</p>
          <div className="mt-6 grid w-full grid-cols-3 gap-3 text-left">
            <Stat label="得分" value={turn?.turnScore ?? 0} />
            <Stat label="答对" value={turn?.correctCount ?? 0} />
            <Stat label="跳过" value={turn?.skipCount ?? 0} />
          </div>
          {current.canAdvance ? (
            <Button
              size="lg"
              className="mt-8"
              disabled={pending}
              onClick={() =>
                void run(() =>
                  window.gameAPI.games.advanceToNextTeam({ gameId, commandId: newCommandId() })
                )
              }
            >
              下一队准备
            </Button>
          ) : null}
          {abortBlock(current)}
        </div>
      )
    }

    const durationSeconds = Math.round(current.turnDurationMs / 1000)
    const syncRemainingSeconds = Math.ceil((current.currentTurn?.remainingMs ?? 0) / 1000)
    const teamColor = current.teams.find((team) => team.id === current.currentTurn?.teamId)?.color
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-2">
          <p className="flex items-center gap-2 text-lg text-first-03">
            {teamColor ? (
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: teamColor }} />
            ) : null}
            当前挑战：{current.currentTurn?.teamName}
            {current.phase === 'paused' ? (
              <span className="rounded-full border border-gold/50 px-2 py-0.5 text-xs font-semibold tracking-[0.14em] text-gold">
                已暂停
              </span>
            ) : null}
          </p>
          <h2 className="question-display text-morning">
            {current.currentQuestion?.text ?? '等待题目'}
          </h2>
          <div className="mt-6 shrink-0">
            <CountdownRing
              turnId={current.currentTurn?.id ?? 'none'}
              syncKey={current.syncKey}
              durationSeconds={durationSeconds}
              syncRemainingSeconds={syncRemainingSeconds}
              isRunning={current.phase === 'running'}
              displayRemainingMs={displayRemainingMs}
            />
          </div>
          {displayRemainingMs <= 0 ? (
            <p className="mt-4 text-3xl font-semibold tracking-[0.18em] text-coral">TIME UP</p>
          ) : null}
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            disabled={!current.canAnswer || pending}
            onClick={() => void answer('CORRECT')}
          >
            答对 Enter
          </Button>
          <Button
            size="lg"
            variant="secondary"
            disabled={!current.canSkip || pending}
            onClick={() => void answer('SKIPPED')}
          >
            跳过 →
            {current.currentTurn && current.currentTurn.skipCount >= 0
              ? ` (${current.currentTurn.skipCount}/${TURN_SKIP_LIMIT})`
              : ''}
          </Button>
          {current.canPause ? (
            <Button
              size="lg"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void run(() => window.gameAPI.games.pause({ gameId, commandId: newCommandId() }))
              }
            >
              暂停 Space
            </Button>
          ) : null}
          {current.canResume ? (
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                void run(() => window.gameAPI.games.resume({ gameId, commandId: newCommandId() }))
              }
            >
              继续
            </Button>
          ) : null}
          {current.canResetTimer ? (
            <Button
              size="lg"
              variant="secondary"
              disabled={pending}
              onClick={() => setResetTimerConfirmOpen(true)}
            >
              重新计时本组
            </Button>
          ) : null}
          <Button
            size="lg"
            variant="ghost"
            disabled={!current.canUndo || pending}
            onClick={() =>
              void run(() =>
                window.gameAPI.games.undoLastAnswer({ gameId, commandId: newCommandId() })
              )
            }
          >
            撤销
          </Button>
        </div>
        {abortBlock(current)}
      </div>
    )
  }

  function abortBlock(current: PlaySnapshot): React.JSX.Element | null {
    if (current.phase === 'running') {
      return <p className="mt-4 text-center text-sm text-first-02">中止整场前请先暂停。</p>
    }
    if (!abortArmed) {
      return (
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => setAbortArmed(true)}>
            中止整场
          </Button>
        </div>
      )
    }
    return (
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            void run(() =>
              window.gameAPI.games.abort({
                gameId,
                commandId: newCommandId(),
                reason: '主持人中止'
              })
            ).then(() => {
              setAbortArmed(false)
            })
          }
        >
          确认中止
        </Button>
        <Button variant="secondary" onClick={() => setAbortArmed(false)}>
          取消
        </Button>
      </div>
    )
  }
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-[12px] border border-line bg-surface px-3 py-3">
      <div className="text-xs text-first-03">{label}</div>
      <div className="text-2xl font-semibold text-gold">
        <ScoreValue value={value} />
      </div>
    </div>
  )
}
