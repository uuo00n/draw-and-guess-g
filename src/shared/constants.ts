export const TEAM_COUNT_MIN = 2
export const TEAM_COUNT_MAX = 12
export const ROUND_COUNT_MIN = 1
export const ROUND_COUNT_MAX = 5
export const TURN_DURATION_MS_MIN = 30_000
export const TURN_DURATION_MS_MAX = 300_000
export const TURN_DURATION_SEC_MIN = TURN_DURATION_MS_MIN / 1000
export const TURN_DURATION_SEC_MAX = TURN_DURATION_MS_MAX / 1000
export const TURN_DURATION_SEC_STEP = 10
export const DEFAULT_TEAM_COUNT = 4
export const DEFAULT_ROUND_COUNT = 1
export const FIXED_ROUND_COUNT = 1
export const TURN_SKIP_LIMIT = 5
export const DEFAULT_TURN_DURATION_SEC = 120

/** 与 resources/data 及 doc 中正式版 xlsx 同名 */
export const BUNDLED_QUESTION_BANK_FILE = '你画我猜-题库模板-正式版.xlsx'

export function clampTurnDurationSec(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TURN_DURATION_SEC
  return Math.min(TURN_DURATION_SEC_MAX, Math.max(TURN_DURATION_SEC_MIN, Math.trunc(value)))
}

export const TEAM_PALETTE = [
  '#FF555F',
  '#FFAD28',
  '#00D4AA',
  '#4DA3FF',
  '#B388FF',
  '#FF6EC7',
  '#FFD166',
  '#06D6A0',
  '#118AB2',
  '#EF476F',
  '#8338EC',
  '#FB5607'
] as const

export const DEFAULT_CATEGORY = '未分类'
export const DEFAULT_DIFFICULTY = '普通'
export const DEFAULT_POINTS = 1

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const IMPORT_MAX_ROWS = 2000

/** 任务栏、Dock、安装包与窗口标题使用的显示名 */
export const APP_DISPLAY_NAME = 'Genpact-draw&guess'
export const APP_WINDOW_TITLE = APP_DISPLAY_NAME
