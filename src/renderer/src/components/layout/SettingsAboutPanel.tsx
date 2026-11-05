import { GenpactBrand } from '@renderer/components/branding/GenpactBrand'
import { DeveloperCreditText } from '@renderer/components/layout/DeveloperCredit'
import { Card, CardTitle } from '@renderer/components/ui/card'
import { APP_DISPLAY_NAME } from '@shared/constants'

export function SettingsAboutPanel({
  appVersion
}: {
  appVersion: string | null
}): React.JSX.Element {
  return (
    <aside aria-labelledby="settings-about-title" className="min-w-0">
      <Card className="space-y-4 border-line bg-surface/95">
        <CardTitle id="settings-about-title">关于本软件</CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <GenpactBrand variant="icon" height={32} />
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="font-semibold text-morning">{APP_DISPLAY_NAME}</p>
            <p className="text-sm text-first-03">版本 {appVersion ?? '…'}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-first-03">
          Genpact China Digital · 离线团建工具
        </p>
        <div className="space-y-1.5 border-t border-line pt-4 text-sm leading-relaxed">
          <DeveloperCreditText />
          <p className="text-xs text-first-03">仅供 China Digital 内部使用。</p>
        </div>
      </Card>
    </aside>
  )
}
