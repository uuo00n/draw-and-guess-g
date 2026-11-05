import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DataInfo } from '@shared/schemas/history'
import { PageShell } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
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

  useEffect(() => {
    void window.gameAPI.app
      .getDataInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [note])

  return (
    <PageShell title="设置" subtitle="Genpact Dalian Digital · 音效、投影和数据库都留在本机。">
      <div className="grid max-w-3xl gap-6">
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
          <Button
            className="mt-4"
            onClick={() => {
              const next = !fullscreen
              setFullscreen(next)
              void window.gameAPI.app.setFullscreen(next)
            }}
          >
            {fullscreen ? '退出全屏偏好' : '进入全屏'}
          </Button>
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
    </PageShell>
  )
}
