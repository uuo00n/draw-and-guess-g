import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DataInfo } from '@shared/schemas/history'
import { PageShell } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
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
    void window.gameAPI.app.getDataInfo().then(setInfo).catch(() => setInfo(null))
  }, [note])

  return (
    <PageShell title="设置" subtitle="音效、投影和数据库都留在本机。">
      <div className="grid max-w-3xl gap-6">
        <section className="rounded-xl border border-brand-muted/20 p-5">
          <h2 className="text-xl font-semibold">音效与动效</h2>
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
          <p className="mt-3 text-sm text-brand-muted">
            快捷键：Space 暂停或继续，Enter 答对，→ 跳过，Ctrl+Z 撤销，F11 投影全屏。输入框里不会触发判题。
          </p>
        </section>
        <section className="rounded-xl border border-brand-muted/20 p-5">
          <h2 className="text-xl font-semibold">投影</h2>
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
        </section>
        <section className="rounded-xl border border-brand-muted/20 p-5">
          <h2 className="text-xl font-semibold">数据库</h2>
          <p className="mt-3 break-all text-sm text-brand-muted">{info?.dbPath ?? '正在读取路径…'}</p>
          <p className="mt-2 text-sm text-brand-muted">
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
          {note ? <p className="mt-3 text-sm">{note}</p> : null}
        </section>
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
    </PageShell>
  )
}
