import ExcelJS from 'exceljs'
import type { AppDatabase } from '../database/connection'
import { getHistory } from './history-service'

function text(value: string | number | null | undefined): string | number {
  return value ?? ''
}

export async function buildResultsWorkbook(db: AppDatabase, gameId: string): Promise<Buffer> {
  const history = getHistory(db, gameId)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'draw-and-guess'
  workbook.created = new Date()

  const overview = workbook.addWorksheet('总览')
  overview.addRow(['字段', '值'])
  const overviewRows: Array<[string, string | number]> = [
    ['赛事名称', history.name],
    ['game_status', history.status],
    ['状态', history.statusLabel],
    ['end_reason', history.endReason ?? ''],
    ['结果', history.outcomeLabel],
    ['授予冠军', history.showChampion ? '是' : '否'],
    ['创建时间', history.createdAt],
    ['开始时间', history.startedAt ?? ''],
    ['结束时间', history.endedAt ?? ''],
    ['轮数', history.roundCount],
    ['单次时长秒', Math.round(history.turnDurationMs / 1000)],
    ['计划挑战', history.plannedTurnCount],
    ['正常完成挑战', history.finishedTurnCount],
    ['未进行挑战', history.notPlayedTurnCount],
    ['总分', history.teams.reduce((sum, team) => sum + team.totalScore, 0)]
  ]
  for (const row of overviewRows) overview.addRow(row)

  const ranking = workbook.addWorksheet('排行')
  ranking.addRow(['名次', '队伍', '总分', '正常完成次数', '未进行次数'])
  for (const team of history.teams) {
    ranking.addRow([team.rank, team.name, team.totalScore, team.finishedTurns, team.notPlayedTurns])
  }

  const questions = workbook.addWorksheet('逐题')
  questions.addRow(['序号', '题目', '分类', '分值', '队列状态', '判定', '轮次', '队伍'])
  for (const question of history.questions) {
    questions.addRow([
      question.position,
      question.text,
      question.category,
      question.points,
      question.state,
      text(question.verdict),
      text(question.roundNo),
      text(question.teamName)
    ])
  }

  const adjustments = workbook.addWorksheet('修正')
  adjustments.addRow(['时间', '队伍', '增量', '旧分', '新分', '原因'])
  for (const adjustment of history.adjustments) {
    adjustments.addRow([
      adjustment.createdAt,
      adjustment.teamName,
      adjustment.delta,
      adjustment.previousTeamScore,
      adjustment.newTeamScore,
      adjustment.reason
    ])
  }

  const usage = workbook.addWorksheet('题目使用')
  usage.addRow(['序号', '题目', '状态', '判定', '是否已用', '是否作废'])
  for (const question of history.questions) {
    const used = question.state === 'CURRENT' || question.state === 'JUDGED' || question.state === 'VOIDED'
    usage.addRow([
      question.position,
      question.text,
      question.state,
      text(question.verdict),
      used ? '是' : '否',
      question.state === 'VOIDED' ? '是' : '否'
    ])
  }

  const schedule = workbook.addWorksheet('挑战排程')
  schedule.addRow(['顺序', '轮次', '队伍', '状态', '结束原因', '本队得分', '剩余毫秒'])
  for (const turn of history.turns) {
    schedule.addRow([
      turn.sequenceNo,
      turn.roundNo,
      turn.teamName,
      turn.status,
      text(turn.endReason),
      turn.turnScore,
      turn.remainingMs
    ])
  }

  const raw = await workbook.xlsx.writeBuffer()
  return Buffer.from(raw)
}
