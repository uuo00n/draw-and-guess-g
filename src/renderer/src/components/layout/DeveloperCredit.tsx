export function DeveloperCreditText(): React.JSX.Element {
  return (
    <>
      <p className="font-medium text-morning">Developer: HuangJunbo · Digital Intern</p>
      <p className="text-first-03">黄俊博 · 数字化实习生</p>
    </>
  )
}

export function DeveloperCredit(): React.JSX.Element {
  return (
    <div className="developer-credit">
      <DeveloperCreditText />
    </div>
  )
}
