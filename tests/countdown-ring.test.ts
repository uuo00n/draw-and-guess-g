import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CountdownRing', () => {
  it('does not settle the turn from onComplete', () => {
    const source = readFileSync('src/renderer/src/components/CountdownRing.tsx', 'utf8')
    expect(source).toContain('onComplete={() => undefined}')
    expect(source).not.toContain('submitAnswer')
    expect(source).not.toContain('finishTurn')
    expect(source).not.toContain('settleTimeout')
  })
})