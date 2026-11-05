export type TurnScheduleInput = {
  teamId: string
  sortOrder: number
}

export type ScheduledTurn = {
  teamId: string
  roundNo: number
  sequenceNo: number
}

/** Round-robin: each round visits every team in sort_order. */
export function buildChallengeSchedule(
  teams: TurnScheduleInput[],
  roundCount: number
): ScheduledTurn[] {
  const sorted = [...teams].sort((a, b) => a.sortOrder - b.sortOrder)
  const schedule: ScheduledTurn[] = []
  let sequenceNo = 1
  for (let roundNo = 1; roundNo <= roundCount; roundNo += 1) {
    for (const team of sorted) {
      schedule.push({ teamId: team.teamId, roundNo, sequenceNo })
      sequenceNo += 1
    }
  }
  return schedule
}

export function shuffleInPlace<T>(items: T[], random: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}
