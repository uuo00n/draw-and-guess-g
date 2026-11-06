import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { pickPreferredQuestionBankId } from '@shared/question-bank-defaults'
import type { ImportResult, QuestionBankSummary, QuestionPage } from '@shared/schemas/questions'
import { PageShell, StatPill } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { StatusNote } from '@renderer/components/ui/status-note'

export function QuestionBankPage(): React.JSX.Element {
  const [banks, setBanks] = useState<QuestionBankSummary[]>([])
  const [selectedBankId, setSelectedBankId] = useState<string | undefined>()
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [pageData, setPageData] = useState<QuestionPage | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshBanks = useCallback(async () => {
    const list = await window.gameAPI.questions.listBanks()
    setBanks(list)
    const preferredId = pickPreferredQuestionBankId(list)
    if (!preferredId) {
      setSelectedBankId(undefined)
      return
    }
    if (!selectedBankId || !list.some((bank) => bank.id === selectedBankId)) {
      setSelectedBankId(preferredId)
    }
  }, [selectedBankId])

  const refreshQuestions = useCallback(async () => {
    if (!selectedBankId) {
      setPageData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await window.gameAPI.questions.list({
        bankId: selectedBankId,
        category: category || undefined,
        search: search || undefined,
        page: 1,
        pageSize: 100
      })
      setPageData(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [selectedBankId, category, search])

  useEffect(() => {
    void refreshBanks()
  }, [refreshBanks])

  useEffect(() => {
    void refreshQuestions()
  }, [refreshQuestions])

  const stats = useMemo(() => {
    const bank = banks.find((b) => b.id === selectedBankId)
    return {
      total: bank?.questionCount ?? 0,
      active: bank?.activeQuestionCount ?? 0
    }
  }, [banks, selectedBankId])

  const onImport = async (): Promise<void> => {
    setError(null)
    setImportResult(null)
    try {
      const response = await window.gameAPI.questions.importFile()
      if (response.canceled) return
      setImportResult(response.result)
      await refreshBanks()
      await refreshQuestions()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <PageShell title="题库管理" subtitle="Excel / CSV 本地导入 · 分类筛选 · 去重校验">
      <div className="mb-6 flex flex-wrap gap-3">
        <Button onClick={() => void onImport()}>导入 .xlsx / .csv</Button>
        <Button variant="secondary" onClick={() => void window.gameAPI.questions.exportTemplate()}>
          下载模板
        </Button>
        <Button
          variant="secondary"
          disabled={!selectedBankId}
          onClick={() =>
            selectedBankId &&
            void window.gameAPI.questions.exportBank({ bankId: selectedBankId, format: 'xlsx' })
          }
        >
          导出当前题库
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">返回首页</Link>
        </Button>
      </div>

      {error ? (
        <StatusNote tone="danger" className="mb-4">
          {error}
        </StatusNote>
      ) : null}

      {importResult ? (
        <Card className="mb-6 border-gold/40">
          <CardTitle>导入结果 · {importResult.fileName}</CardTitle>
          <CardDescription className="mt-2">
            共 {importResult.totalRows} 行 · 成功 {importResult.importedCount} · 重复跳过{' '}
            {importResult.skippedDuplicateCount} · 无效 {importResult.skippedInvalidCount}
          </CardDescription>
          {importResult.errors.length > 0 ? (
            <StatusNote tone="danger" className="mt-4">
              <ul className="max-h-40 space-y-1 overflow-auto">
                {importResult.errors.slice(0, 20).map((err) => (
                  <li key={`${err.rowNumber}-${err.message}`}>
                    第 {err.rowNumber} 行：{err.message}
                  </li>
                ))}
              </ul>
            </StatusNote>
          ) : (
            <StatusNote tone="success" className="mt-4">
              题目已写入本地题库。
            </StatusNote>
          )}
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatPill label="题库数" value={banks.length} />
        <StatPill label="题目总数" value={stats.total} />
        <StatPill label="有效题目" value={stats.active} />
        <div>
          <label className="text-xs tracking-[0.08em] text-first-03 uppercase">选择题库</label>
          <Select
            className="mt-1"
            value={selectedBankId ?? ''}
            onChange={(e) => setSelectedBankId(e.target.value || undefined)}
          >
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="搜索题目"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          className="w-auto min-w-40"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">全部分类</option>
          {pageData?.categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={() => void refreshQuestions()} disabled={loading}>
          {loading ? '刷新中' : '刷新'}
        </Button>
      </div>

      <div className="gp-table-wrap">
        <table className="gp-table min-w-full">
          <thead>
            <tr>
              <th>题目</th>
              <th>分类</th>
              <th>难度</th>
              <th>分值</th>
            </tr>
          </thead>
          <tbody>
            {pageData?.items.map((item) => (
              <tr key={item.id}>
                <td>{item.text}</td>
                <td>{item.category}</td>
                <td>{item.difficulty}</td>
                <td className="tabular-nums text-gold">{item.points}</td>
              </tr>
            ))}
            {!pageData?.items.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-first-03">
                  {selectedBankId ? '暂无题目，请先导入题库' : '请先导入题库'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
