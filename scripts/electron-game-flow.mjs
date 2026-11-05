import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const resultPath = join(mkdtempSync(join(tmpdir(), 'draw-guess-e2e-')), 'result.json')
const userData = mkdtempSync(join(tmpdir(), 'draw-guess-userdata-'))
const electron = join(process.cwd(), 'node_modules', '.bin', 'electron')
const command = process.env.E2E_NO_XVFB === '1' ? electron : 'xvfb-run'
const args =
  process.env.E2E_NO_XVFB === '1'
    ? ['.']
    : ['-a', electron, '.']

const run = spawnSync(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    E2E_GAME_FLOW: '1',
    E2E_RESULT_PATH: resultPath,
    E2E_USER_DATA: userData
  },
  encoding: 'utf8',
  timeout: 120000
})

let result = null
try {
  result = JSON.parse(readFileSync(resultPath, 'utf8'))
} catch {
  result = null
}

if (!result?.ok || run.status !== 0) {
  console.error(run.stdout)
  console.error(run.error ?? run.stderr)
  console.error(result ? JSON.stringify(result, null, 2) : `no result file at ${resultPath}`)
  process.exit(run.status || 1)
}

console.log(JSON.stringify(result))
