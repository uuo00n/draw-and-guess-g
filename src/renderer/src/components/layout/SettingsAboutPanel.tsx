import { GenpactBrand } from '@renderer/components/branding/GenpactBrand'
import { DeveloperCreditText } from '@renderer/components/layout/DeveloperCredit'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { APP_DISPLAY_NAME } from '@shared/constants'

export function SettingsAboutPanel({
  appVersion
}: {
  appVersion: string | null
}): React.JSX.Element {
  return (
    <aside className="w-full lg:sticky lg:top-6 lg:max-w-sm lg:justify-self-end">
      <Card className="border-line bg-surface/90">
        <div className="flex justify-center border-b border-line pb-5">
          <GenpactBrand variant="stacked" height={88} className="max-w-[220px]" />
        </div>
        <div className="mt-5 space-y-5">
          <section>
            <CardTitle className="text-base">软件信息</CardTitle>
            <CardDescription className="mt-2 space-y-1 text-sm leading-relaxed text-first-02">
              <p>
                产品名称：<span className="text-morning">{APP_DISPLAY_NAME}</span>
              </p>
              <p>
                版本：
                <span className="tabular-nums text-morning">{appVersion ?? '…'}</span>
              </p>
              <p>Genpact Dalian Digital · 团建你画我猜</p>
              <p className="text-first-03">离线桌面程序，数据保存在本机。</p>
            </CardDescription>
          </section>
          <section>
            <CardTitle className="text-base">开发者</CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed text-first-02">
              <DeveloperCreditText />
            </CardDescription>
          </section>
          <p className="border-t border-line pt-4 text-xs leading-relaxed text-first-03">
            版权仅供 Dalian Digital 内部使用。
          </p>
        </div>
      </Card>
    </aside>
  )
}
