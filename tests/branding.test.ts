import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Genpact presentation', () => {
  it('keeps the developer credit exact and out of the click path', () => {
    const source = readFileSync('src/renderer/src/components/layout/DeveloperCredit.tsx', 'utf8')
    const css = readFileSync('src/renderer/src/assets/main.css', 'utf8')
    expect(source).toContain('Developer: Huang Junbo (Intern)')
    expect(css).toContain('pointer-events: none')
    expect(css).toContain('font-size: 12px')
    expect(css).toContain('#adb1ac')
  })

  it('uses a replaceable local logo and a text fallback', () => {
    const source = readFileSync('src/renderer/src/components/branding/GenpactBrand.tsx', 'utf8')
    expect(source).toContain('GENPACT')
    expect(source).toContain('genpact-logo.svg')
    expect(source).toContain('object-contain')
    expect(source).not.toContain('filter:')
    expect(source).not.toContain('http')
  })

  it('keeps the countdown ring decorative', () => {
    const source = readFileSync('src/renderer/src/components/CountdownRing.tsx', 'utf8')
    expect(source).toContain('#FFFFFF')
    expect(source).toContain('#FFAD28')
    expect(source).toContain('#FF555F')
    expect(source).toContain('#444744')
    expect(source).toContain('onComplete={() => undefined}')
    expect(source).not.toContain('submitAnswer')
    expect(source).not.toContain('finishTurn')
  })
})
