export function gameStatusLabel(status: string): string {
  switch (status) {
    case 'GAME_READY':
      return '未开始'
    case 'GAME_ACTIVE':
      return '进行中'
    case 'GAME_FINISHED':
      return '正常结束'
    case 'GAME_FINISHED_EARLY':
      return '提前结束'
    case 'GAME_ABORTED':
      return '已中止'
    default:
      return status
  }
}

export function outcomeLabel(input: {
  status: string
  uniqueLeaderName: string | null
  tied: boolean
}): string {
  if (input.status !== 'GAME_FINISHED') return '不授冠'
  if (input.uniqueLeaderName) return `冠军 ${input.uniqueLeaderName}`
  if (input.tied) return '并列'
  return '无冠军'
}
