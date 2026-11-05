import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Genpact presentation', () => {
  it('keeps only the English developer credit in Settings', () => {
    const source = readFileSync('src/renderer/src/components/layout/DeveloperCredit.tsx', 'utf8')
    const about = readFileSync('src/renderer/src/components/layout/SettingsAboutPanel.tsx', 'utf8')
    expect(source).toContain('Developer: HuangJunbo · Digital Intern')
    expect(source).not.toContain('黄俊博 · 数字化实习生')
    expect(about).toContain('<DeveloperCreditText />')
    expect(source).not.toContain('developer-credit')
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
