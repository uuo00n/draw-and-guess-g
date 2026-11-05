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
    <aside className="w-full lg:sticky lg:top-6 lg:w-[22rem] lg:shrink-0 lg:justify-self-end">
      <Card className="overflow-hidden border-line bg-surface/95 p-0 shadow-lg shadow-black/20">
        <div className="flex justify-center border-b border-line bg-midnight/50 px-6 py-7">
          <GenpactBrand variant="stacked" height={72} className="max-w-[220px]" />
        </div>

        <div className="space-y-6 p-6">
          <section className="space-y-3">
            <CardTitle className="text-base tracking-wide text-morning">软件信息</CardTitle>
            <dl className="space-y-2.5 text-sm leading-relaxed">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-first-03">产品名称</dt>
                <dd className="font-medium text-morning">{APP_DISPLAY_NAME}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-first-03">版本</dt>
                <dd className="font-medium tabular-nums text-morning">{appVersion ?? '…'}</dd>
              </div>
            </dl>
            <p className="text-sm leading-relaxed text-first-02">
              Genpact Dalian Digital · 团建你画我猜
            </p>
            <p className="text-sm leading-relaxed text-first-03">离线桌面程序，数据保存在本机。</p>
          </section>

          <section
            className="rounded-[12px] border border-line bg-midnight/45 p-4"
            style={{ boxShadow: 'inset 3px 0 0 var(--gp-coral)' }}
          >
            <CardTitle className="text-base tracking-wide text-morning">开发者</CardTitle>
            <div className="mt-3 space-y-1 text-sm leading-relaxed text-first-02">
              <DeveloperCreditText />
            </div>
          </section>

          <p className="border-t border-line pt-4 text-center text-xs leading-relaxed text-first-03">
            版权仅供 Dalian Digital 内部使用。
          </p>
        </div>
      </Card>
    </aside>
  )
}
