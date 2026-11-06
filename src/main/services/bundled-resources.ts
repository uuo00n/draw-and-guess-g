import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { BUNDLED_QUESTION_BANK_FILE } from '../../shared/constants'

/** 开发态读仓库 `resources/`；打包后读 asarUnpack 解出的 `resources/`。 */
export function bundledResourcePath(...parts: string[]): string {
  if (app?.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'resources', ...parts)
  }
  const appPath = app?.getAppPath?.() ?? process.cwd()
  return join(appPath, 'resources', ...parts)
}

export function bundledQuestionBankPath(): string {
  return bundledResourcePath('data', BUNDLED_QUESTION_BANK_FILE)
}

export function bundledQuestionBankExists(): boolean {
  return existsSync(bundledQuestionBankPath())
}
