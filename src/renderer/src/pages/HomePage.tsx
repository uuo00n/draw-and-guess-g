import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { GameSummary } from '@shared/schemas/play'
import { GenpactBrand } from '@renderer/components/branding/GenpactBrand'
import { StatPill } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { useUiSettings } from '@renderer/stores/ui-settings-store'

export function HomePage(): React.JSX.Element {
  const [activeQuestions, setActiveQuestions] = useState(0)
  const [version, setVersion] = useState('')
  const [games, setGames] = useState<GameSummary[]>([])
  const reducedMotion = useReducedMotion()
  const effectLevel = useUiSettings((state) => state.effectLevel)
  const motionOn = !reducedMotion && effectLevel !== 'off'

  useEffect(() => {
    void window.gameAPI.app.getHomeSummary().then((summary) => {
      setActiveQuestions(summary.activeQuestionCount)
      setVersion(summary.version)
    })
    void window.gameAPI.games
      .list()
      .then(setGames)
      .catch(() => setGames([]))
  }, [])

  const resumable = games.filter(
    (game) => game.status === 'GAME_READY' || game.status === 'GAME_ACTIVE'
  )

  return (
    <div className="app-shell">
      <motion.div
        className="grid flex-1 items-center gap-10 lg:grid-cols-[1.35fr_0.75fr]"
        initial={motionOn ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <section className="py-4">
          <GenpactBrand variant="horizontal" height={64} />
          <p className="mt-8 text-xs font-semibold tracking-[0.32em] text-gold">DALIAN DIGITAL</p>
          <h1 className="mt-3 max-w-4xl text-[clamp(3.4rem,6.4vw,6.4rem)] leading-[0.9] font-semibold tracking-[-0.045em] text-morning">
            DRAW &amp; GUESS
          </h1>
          <p className="mt-4 text-2xl text-first-03">你画我猜</p>
          <p className="mt-3 text-lg text-morning">Genpact Dalian Digital · Team Building</p>
          <p className="mt-2 text-xs font-semibold tracking-[0.22em] text-first-02">
            TEAM CHALLENGE
          </p>
          <div className="mt-8 h-px w-28 bg-gold/80" />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/setup">创建新比赛</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/questions">题库管理</Link>
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild variant="ghost">
              <Link to="/history">历史记录</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/settings">设置</Link>
            </Button>
          </div>
        </section>

        <Card className="flex flex-col gap-5">
          <div>
            <CardTitle>活动控制台</CardTitle>
            <CardDescription className="mt-2">
              单屏公开出题。创建比赛时冻结队伍、轮次和题目队列。
            </CardDescription>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatPill label="有效题目" value={activeQuestions} />
            <StatPill label="版本" value={version || '—'} />
          </div>
          <p className="text-sm text-first-02">本地 SQLite · 完全离线 · 2–12 支队伍</p>
          {resumable.slice(0, 1).map((game) => (
            <Link
              key={game.id}
              to={`/session/${game.id}`}
              className="rounded-[10px] border border-coral/40 bg-coral/10 px-4 py-3 text-sm font-semibold text-morning hover:bg-coral/15"
            >
              继续未完成比赛 · {game.name}
            </Link>
          ))}
          {games.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-first-03">
                最近比赛
              </p>
              <div className="space-y-1">
                {games.slice(0, 5).map((game) => (
                  <Link
                    key={game.id}
                    to={`/history/${game.id}`}
                    className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 text-sm text-first-03 hover:bg-elevated hover:text-morning"
                  >
                    <span className="truncate">{game.name}</span>
                    <span className="shrink-0 text-xs">{game.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-first-03">还没有比赛记录。先导入题库，再创建第一场。</p>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
