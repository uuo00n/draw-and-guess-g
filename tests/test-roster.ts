import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CreateGameInput } from '../src/shared/schemas/games'
import { saveCurrentRoster } from '../src/main/services/roster-service'

export function makeTestDataDir(groupCount = 2): string {
  const dir = mkdtempSync(join(tmpdir(), 'draw-guess-test-'))
  saveCurrentRoster(dir, {
    total: groupCount,
    groupCount,
    groups: Array.from({ length: groupCount }, (_, index) => ({
      group: index + 1,
      members: [`测试成员${index + 1}`]
    }))
  })
  return dir
}

export function testCreateInput(
  bankId: string,
  overrides: Partial<CreateGameInput> = {}
): CreateGameInput {
  return {
    commandId: randomUUID(),
    bankId,
    categoryFilter: ['测试'],
    roundCount: 1,
    turnDurationSec: 60,
    scoreMode: 'UNIFORM',
    performerMembers: [],
    ...overrides
  }
}
