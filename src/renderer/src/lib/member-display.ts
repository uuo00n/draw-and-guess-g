export function formatMembersDisplay(members: string[], performer: string | null): string {
  return members
    .map((member) => (performer === member ? `${member}（表演题目）` : member))
    .join('、')
}
