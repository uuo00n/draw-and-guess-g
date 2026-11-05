import { useState } from 'react'
import { cn } from '@renderer/lib/utils'

/**
 * 官方 Logo 只读取本地文件，不在这里绘制或改色。
 * 替换方式：把获准文件放到 src/renderer/src/assets/branding/
 * - genpact-logo.svg 或 genpact-logo.png 会优先用于 wordmark / lockup
 * - 其余文件名见 VARIANT_FILES
 * 文件缺失或加载失败时显示文字 GENPACT，应用继续运行。
 */
const brandAssets = import.meta.glob('../../assets/branding/*.{svg,png,webp}', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>

const VARIANT_FILES = {
  wordmark: [
    'genpact-logo.svg',
    'genpact-logo.png',
    'genpact-wordmark-white.png',
    'genpact-lockup-horizontal-white.png'
  ],
  horizontal: [
    'genpact-logo.svg',
    'genpact-logo.png',
    'genpact-lockup-horizontal-white.png',
    'genpact-wordmark-white.png'
  ],
  stacked: [
    'genpact-logo.svg',
    'genpact-logo.png',
    'genpact-lockup-stacked-white.png',
    'genpact-wordmark-white.png'
  ],
  icon: ['genpact-icon-white.png', 'genpact-logo.svg', 'genpact-logo.png']
} as const

/** 相对各页面传入的 height 统一放大 10%，避免多处改数值。 */
const BRAND_DISPLAY_SCALE = 1.1

export type GenpactBrandVariant = keyof typeof VARIANT_FILES

function assetUrl(fileName: string): string | null {
  const found = Object.entries(brandAssets).find(([path]) => path.endsWith(`/${fileName}`))
  return found?.[1] ?? null
}

function resolveBrandSrc(variant: GenpactBrandVariant): string | null {
  for (const fileName of VARIANT_FILES[variant]) {
    const url = assetUrl(fileName)
    if (url) return url
  }
  return null
}

export function GenpactBrand({
  variant = 'wordmark',
  surface = 'dark',
  height = 40,
  className
}: {
  variant?: GenpactBrandVariant
  surface?: 'dark' | 'light'
  height?: number
  className?: string
}): React.JSX.Element {
  const displayHeight = Math.round(height * BRAND_DISPLAY_SCALE)
  const src = resolveBrandSrc(variant)
  if (!src) {
    return <BrandFallback surface={surface} height={displayHeight} className={className} />
  }
  return (
    <BrandImage src={src} height={displayHeight} surface={surface} className={className} />
  )
}

function BrandImage({
  src,
  height,
  surface,
  className
}: {
  src: string
  height: number
  surface: 'dark' | 'light'
  className?: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) return <BrandFallback surface={surface} height={height} className={className} />
  const image = (
    <img
      src={src}
      alt="Genpact"
      draggable={false}
      className="block object-contain"
      style={{ height, width: 'auto', maxWidth: '100%' }}
      onError={() => setFailed(true)}
    />
  )
  if (surface === 'light') {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded-[10px] bg-midnight px-2.5 py-1.5',
          className
        )}
      >
        {image}
      </span>
    )
  }
  return <span className={cn('inline-flex shrink-0 items-center', className)}>{image}</span>
}

function BrandFallback({
  surface,
  height,
  className
}: {
  surface: 'dark' | 'light'
  height: number
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center font-semibold tracking-[0.28em]',
        surface === 'light' ? 'text-midnight' : 'text-morning',
        className
      )}
      style={{ height, fontSize: Math.max(12, Math.round(height * 0.42)) }}
    >
      GENPACT
    </span>
  )
}
