import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import type { GameCommandResult, PlaySnapshot } from '@shared/schemas/play'
import { TeamScoreStrip } from '@renderer/components/TeamScoreStrip'
import { CountdownRing } from '@renderer/components/CountdownRing'
import { ScoreValue } from '@renderer/components/ScoreValue'
import { Button } from '@renderer/components/ui/button'
import { useGameSnapshot } from '@renderer/hooks/useGameSnapshot'
import { useTurnClock } from '@renderer/hooks/useTurnClock'
import { ChampionMark, useSessionEffects } from '@renderer/hooks/useSessionEffects'
import { useUiSettings } from '@renderer/stores/ui-settings-store'

function newCommandId(): string {
  return crypto.randomUUID()
}

export function GameSessionPage(): React.JSX.Element {
  const { gameId = '' } = useParams()
  const { snapshot, error, setSnapshot, setError } = useGameSnapshot(gameId)
  const [pending, setPending] = useState(false)
  const [abortArmed, setAbortArmed] = useState(false)
  const displayRemainingMs = useTurnClock({
    turnId: snapshot?.currentTurn?.id ?? null,
    status: snapshot?.currentTurn?.status ?? null,
    authoritativeRemainingMs: snapshot?.currentTurn?.remainingMs ?? 0
  })
  const { championMark } = useSessionEffects(snapshot, displayRemainingMs)
  const reducedMotion = useReducedMotion()
  const effectLevel = useUiSettings((state) => state.effectLevel)
  const muted = useUiSettings((state) => state.muted)
  const setMuted = useUiSettings((state) => state.setMuted)
  const motionOn = !reducedMotion && effectLevel !== 'off'

  useEffect(() => {
    if (!snapshot) return
    const onKey = (event: KeyboardEvent): void => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.code === 'Space') {
        event.preventDefault()
        if (snapshot.canPause) void run(() => window.gameAPI.games.pause({ gameId, commandId: newCommandId() }))
        if (snapshot.canResume) void run(() => window.gameAPI.games.resume({ gameId, commandId: newCommandId() }))
      }
      if (event.key === 'Enter' && snapshot.canAnswer) {
        event.preventDefault()
        void answer('CORRECT')
      }
      if (event.key === 'ArrowRight' && snapshot.canAnswer) {
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
  }, [snapshot, gameId])

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
    if (!snapshot?.currentTurn || !snapshot.currentQuestion || !snapshot.canAnswer) return Promise.resolve()
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

  if (!snapshot) {
    return <div className="app-shell text-brand-muted">{error ?? '正在读取比赛…'}</div>
  }

  return (
    <div className="app-shell">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-brand-accent">DRAW &amp; GUESS</p>
          <h1 className="text-xl font-semibold lg:text-2xl">{snapshot.name}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-right text-sm text-brand-muted">
          <Button variant="ghost" onClick={() => setMuted(!muted)}>
            {muted ? '已静音' : '音效开'}
          </Button>
          <Button variant="ghost" onClick={() => void window.gameAPI.app.toggleFullscreen()}>
            投影全屏
          </Button>
          <div>
            第 {snapshot.currentTurn?.roundNo ?? 1} / {snapshot.roundCount} 轮
          </div>
          <Link to={`/history/${gameId}`} className="text-brand-accent">
            记录
          </Link>
          <Link to="/" className="text-brand-accent">
            返回首页
          </Link>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-md border border-brand-accent-strong/40 bg-brand-accent-strong/10 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <TeamScoreStrip snapshot={snapshot} />
      <motion.section
        key={`${snapshot.phase}:${snapshot.currentTurn?.id ?? 'none'}:${snapshot.currentQuestion?.queueItemId ?? 'none'}`}
        className="mt-6 flex flex-1 flex-col"
        initial={motionOn ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {renderPhase(snapshot)}
      </motion.section>
    </div>
  )

  function renderPhase(current: PlaySnapshot): React.JSX.Element {
    if (current.phase === 'recovery') {
      return (
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold">需要人工恢复</h2>
          <p className="mt-4 text-brand-muted">
            检测到 {current.recoveryReason}。已停止开始、判题和自动改分，分数保持原样。
          </p>
        </div>
      )
    }
    if (current.phase === 'final' || current.phase === 'final-early' || current.phase === 'aborted') {
      const title =
        current.phase === 'final'
          ? '最终排行榜'
          : current.phase === 'final-early'
            ? '当前积分榜（比赛提前结束）'
            : '比赛已中止'
      return (
        <div className="mx-auto w-full max-w-3xl">
          <ChampionMark active={championMark && current.showChampion} />
          <h2 className="text-center text-4xl font-semibold">{title}</h2>
          {current.showChampion && current.championTeamId ? (
            <p className="mt-4 text-center text-2xl text-brand-accent">
              冠军 {current.leaderboard.find((team) => team.teamId === current.championTeamId)?.name}
            </p>
          ) : (
            <p className="mt-4 text-center text-brand-muted">本场不授予冠军</p>
          )}
          <ol className="mt-8 space-y-3">
            {current.leaderboard.map((team) => (
              <li
                key={team.teamId}
                className="flex items-center justify-between rounded-xl border border-brand-muted/20 bg-brand-surface/70 px-4 py-3"
              >
                <span>
                  第 {team.rank} 名 · {team.name}
                </span>
                <span className="text-2xl font-semibold">
                  <ScoreValue value={team.totalScore} />
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={() => void window.gameAPI.games.exportResults(gameId)}>导出成绩</Button>
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
      return (
        <div className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center text-center">
          <p className="text-brand-muted">ROUND {current.currentTurn?.roundNo} / {current.roundCount}</p>
          <h2 className="mt-4 text-5xl font-semibold lg:text-6xl">下一位：{current.currentTurn?.teamName}</h2>
          <p className="mt-4 text-brand-muted">准备页不展示题目。主持人确认后才开始计时。</p>
          <Button
            size="lg"
            className="mt-8"
            disabled={!current.canStart || pending}
            onClick={() => void run(() => window.gameAPI.games.startTurn({ gameId, commandId: newCommandId() }))}
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
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-semibold">{turn?.teamName} 本队结束</h2>
          <p className="mt-4 text-brand-muted">倒计时已停止。下一队需要主持人手动开始。</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left md:grid-cols-4">
            <Stat label="得分" value={turn?.turnScore ?? 0} />
            <Stat label="答对" value={turn?.correctCount ?? 0} />
            <Stat label="跳过" value={turn?.skipCount ?? 0} />
            <Stat label="超时" value={turn?.timeoutCount ?? 0} />
          </div>
          {current.canAdvance ? (
            <Button
              size="lg"
              className="mt-8"
              disabled={pending}
              onClick={() =>
                void run(() => window.gameAPI.games.advanceToNextTeam({ gameId, commandId: newCommandId() }))
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
    return (
      <div className="flex flex-1 flex-col">
        <div className="mt-6 flex flex-1 flex-col items-center justify-center">
          <p className="text-lg text-brand-muted">
            当前挑战：{current.currentTurn?.teamName}
            {current.phase === 'paused' ? ' · 已暂停' : ''}
          </p>
          <h2 className="mt-6 max-w-5xl text-center text-4xl font-semibold leading-tight break-words text-brand-text md:text-6xl xl:text-7xl">
            {current.currentQuestion?.text ?? '等待题目'}
          </h2>
          <div className="mt-8">
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
            <p className="mt-4 text-3xl font-semibold tracking-wide text-brand-accent-strong">TIME UP</p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button disabled={!current.canAnswer || pending} onClick={() => void answer('CORRECT')}>
            答对 Enter
          </Button>
          <Button variant="secondary" disabled={!current.canAnswer || pending} onClick={() => void answer('SKIPPED')}>
            跳过 →
          </Button>
          {current.canPause ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void run(() => window.gameAPI.games.pause({ gameId, commandId: newCommandId() }))}
            >
              暂停 Space
            </Button>
          ) : null}
          {current.canResume ? (
            <Button
              disabled={pending}
              onClick={() => void run(() => window.gameAPI.games.resume({ gameId, commandId: newCommandId() }))}
            >
              继续
            </Button>
          ) : null}
          <Button
            variant="ghost"
            disabled={!current.canUndo || pending}
            onClick={() => void run(() => window.gameAPI.games.undoLastAnswer({ gameId, commandId: newCommandId() }))}
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
      return <p className="mt-6 text-center text-sm text-brand-muted">中止整场前请先暂停。</p>
    }
    if (!abortArmed) {
      return (
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={() => setAbortArmed(true)}>
            中止整场
          </Button>
        </div>
      )
    }
    return (
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            void run(() =>
              window.gameAPI.games.abort({ gameId, commandId: newCommandId(), reason: '主持人中止' })
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
    <div className="rounded-lg border border-brand-muted/20 bg-brand-bg/40 px-3 py-3">
      <div className="text-xs text-brand-muted">{label}</div>
      <div className="text-2xl font-semibold">
        <ScoreValue value={value} />
      </div>
    </div>
  )
}
