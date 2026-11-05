import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DataInfo } from '@shared/schemas/history'
import type { TeamRoster } from '@shared/schemas/roster'
import { PageShell } from '@renderer/components/layout/AppShell'
import { SettingsAboutPanel } from '@renderer/components/layout/SettingsAboutPanel'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useUiSettings } from '@renderer/stores/ui-settings-store'
import type { EffectLevel } from '@shared/effects'

export function SettingsPage(): React.JSX.Element {
  const muted = useUiSettings((state) => state.muted)
  const effectLevel = useUiSettings((state) => state.effectLevel)
  const fullscreen = useUiSettings((state) => state.fullscreen)
  const setMuted = useUiSettings((state) => state.setMuted)
  const setEffectLevel = useUiSettings((state) => state.setEffectLevel)
  const setFullscreen = useUiSettings((state) => state.setFullscreen)
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [resetUsedOpen, setResetUsedOpen] = useState(false)
  const [resettingUsed, setResettingUsed] = useState(false)
  const [resetUsedError, setResetUsedError] = useState<string | null>(null)
  const [resetUsedCount, setResetUsedCount] = useState<number | null>(null)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [pendingRoster, setPendingRoster] = useState<TeamRoster | null>(null)
  const [replaceError, setReplaceError] = useState<string | null>(null)

  const refreshInfo = (): void => {
    void window.gameAPI.app
      .getDataInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }

  useEffect(() => {
    refreshInfo()
  }, [note])

  const pickReplaceFile = async (): Promise<void> => {
    setReplaceError(null)
    const result = await window.gameAPI.app.replaceRosterFile()
    if (!result.ok) {
      if (result.error && result.error !== '已取消') setReplaceError(result.error)
      return
    }
    if (result.roster) {
      setPendingRoster(result.roster)
      setReplaceOpen(true)
    }
  }

  const confirmReplace = (): void => {
    if (!pendingRoster) return
    void window.gameAPI.app.saveRoster(pendingRoster).then(() => {
      setReplaceOpen(false)
      setNote(`已更新分组：${pendingRoster.groupCount} 组 · ${pendingRoster.total} 人`)
      setPendingRoster(null)
      refreshInfo()
    })
  }

  return (
    <PageShell title="设置" subtitle="Genpact China Digital · 音效、投影和数据库都留在本机。">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_clamp(22rem,28%,28rem)] xl:gap-8">
        <div className="grid min-w-0 gap-6">
        <Card>
          <CardTitle>音效与动效</CardTitle>
          <CardDescription className="mt-2">
            减少动态效果时，页面入场和撒花会停用。计时仍由主进程决定。
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant={muted ? 'default' : 'secondary'} onClick={() => setMuted(!muted)}>
              {muted ? '音效已静音' : '关闭音效'}
            </Button>
            {(['off', 'low', 'normal'] as EffectLevel[]).map((level) => (
              <Button
                key={level}
                variant={effectLevel === level ? 'default' : 'secondary'}
                onClick={() => setEffectLevel(level)}
              >
                动效 {level === 'off' ? '关闭' : level === 'low' ? '低' : '正常'}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-sm text-first-03">
            快捷键：Space 暂停或继续，Enter 答对，→ 跳过，Ctrl+Z 撤销，F11
            投影全屏。输入框里不会触发判题。
          </p>
        </Card>
        <Card>
          <CardTitle>投影</CardTitle>
          <CardDescription className="mt-2">
            适合 1920×1080 会场屏幕。F11 同样可以切换全屏。
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                const next = !fullscreen
                setFullscreen(next)
                void window.gameAPI.app.setFullscreen(next)
              }}
            >
              {fullscreen ? '退出全屏偏好' : '进入全屏'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void window.gameAPI.app.resetPageZoom().then(() => {
                  setNote('界面缩放已恢复为 100%')
                })
              }}
            >
              恢复 100% 缩放
            </Button>
          </div>
          <p className="mt-3 text-sm text-first-03">
            误触 ⌘+ / ⌘- 或触控板放大后，可用 ⌘0、上方按钮或 ⌘- 缩回默认比例。
          </p>
        </Card>
        <Card>
          <CardTitle>分组名单</CardTitle>
          <CardDescription className="mt-2">
            替换后只影响新建比赛与分组页展示，不会改写已有比赛的冻结快照。
          </CardDescription>
          <Button className="mt-4" variant="secondary" onClick={() => void pickReplaceFile()}>
            替换分组名单
          </Button>
          {replaceError ? <p className="mt-3 text-sm text-coral">{replaceError}</p> : null}
        </Card>
        <Card>
          <CardTitle>数据库</CardTitle>
          <p className="mt-3 break-all text-sm text-first-03">{info?.dbPath ?? '正在读取路径…'}</p>
          <p className="mt-2 text-sm text-first-03">
            {info ? `${info.gameCount} 场历史 · ${info.bytes} 字节 · 版本 ${info.version}` : null}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={() =>
                void window.gameAPI.app.backupDatabase().then((result) => {
                  setNote(result.saved ? `已备份到 ${result.path ?? ''}` : '已取消备份')
                })
              }
            >
              立即备份
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void window.gameAPI.app.restoreDatabase().then((result) => {
                  setNote(
                    result.restored
                      ? `已恢复。覆盖前的库在 ${result.safetyPath ?? ''}。计时不会自动开始。`
                      : '已取消恢复'
                  )
                })
              }
            >
              从备份恢复
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setResetUsedError(null)
                setResetUsedCount(null)
                setResetUsedOpen(true)
              }}
            >
              重置已出题记录
            </Button>
            <Button variant="destructive" onClick={() => setClearOpen(true)}>
              清空所有历史记录
            </Button>
            <Button variant="ghost" onClick={() => void window.gameAPI.app.openDataFolder()}>
              打开数据目录
            </Button>
          </div>
          {note ? <p className="mt-3 text-sm text-morning">{note}</p> : null}
        </Card>
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/">返回首页</Link>
        </Button>
        </div>
        <SettingsAboutPanel appVersion={info?.version ?? null} />
      </div>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空所有历史记录？</DialogTitle>
            <DialogDescription>
              将删除全部比赛记录（含未结束的比赛）和已出题记录，之前出过的题将可再次抽取。
              题库、当前分组和已有备份文件会保留。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={clearing} onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={clearing}
              onClick={() => {
                setClearing(true)
                void window.gameAPI.app
                  .clearAllHistory()
                  .then((result) => {
                    setClearOpen(false)
                    setNote(`已清空 ${result.deletedCount} 场比赛记录及已出题记录`)
                    refreshInfo()
                  })
                  .finally(() => setClearing(false))
              }}
            >
              {clearing ? '清空中…' : '清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetUsedOpen} onOpenChange={(open) => !resettingUsed && setResetUsedOpen(open)}>
        <DialogContent>
          {resetUsedCount !== null ? (
            <>
              <DialogHeader>
                <DialogTitle>{resetUsedCount === 0 ? '没有已出题记录' : '重置成功'}</DialogTitle>
                <DialogDescription>
                  {resetUsedCount === 0
                    ? '当前没有需要重置的已出题记录。'
                    : `已重置 ${resetUsedCount} 条已出题记录。之前出过的题可在新比赛中再次抽取。`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button autoFocus onClick={() => setResetUsedOpen(false)}>
                  确定
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>重置已出题记录？</DialogTitle>
                <DialogDescription>
                  重置后，出过的题可在新比赛中再次抽取。题库、比赛历史和成绩会保留。
                </DialogDescription>
              </DialogHeader>
              {resetUsedError ? <p role="alert" className="text-sm text-coral">{resetUsedError}</p> : null}
              <DialogFooter>
                <Button variant="secondary" disabled={resettingUsed} onClick={() => setResetUsedOpen(false)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  disabled={resettingUsed}
                  onClick={() => {
                    setResettingUsed(true)
                    setResetUsedError(null)
                    void window.gameAPI.app.resetUsedQuestions()
                      .then((count) => {
                        if (count === null) {
                          setResetUsedError('还有未结束的比赛，请先结束比赛再重置。')
                          return
                        }
                        setResetUsedCount(count)
                      })
                      .catch(() => setResetUsedError('重置失败，请重试。'))
                      .finally(() => setResettingUsed(false))
                  }}
                >
                  {resettingUsed ? '重置中…' : '确认重置'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>替换分组名单？</DialogTitle>
            <DialogDescription>
              新名单为 {pendingRoster?.groupCount} 组 · {pendingRoster?.total}{' '}
              人。确认后立即生效，之后新建的比赛会使用这份名单。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReplaceOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmReplace}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
