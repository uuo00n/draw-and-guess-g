import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ImportResult, QuestionBankSummary, QuestionPage } from '@shared/schemas/questions'
import { PageShell, StatPill } from '@renderer/components/layout/AppShell'
import { Button } from '@renderer/components/ui/button'
import { Card, CardDescription, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

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
    if (!selectedBankId && list[0]) {
      setSelectedBankId(list[0].id)
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
        <div className="mb-4 rounded-md border border-brand-accent-strong/50 bg-brand-accent-strong/10 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {importResult ? (
        <Card className="mb-6 border-brand-accent/40">
          <CardTitle>导入结果 · {importResult.fileName}</CardTitle>
          <CardDescription className="mt-2">
            共 {importResult.totalRows} 行 · 成功 {importResult.importedCount} · 重复跳过{' '}
            {importResult.skippedDuplicateCount} · 无效 {importResult.skippedInvalidCount}
          </CardDescription>
          {importResult.errors.length > 0 ? (
            <ul className="mt-4 max-h-40 overflow-auto text-sm text-brand-muted">
              {importResult.errors.slice(0, 20).map((err) => (
                <li key={`${err.rowNumber}-${err.message}`}>
                  第 {err.rowNumber} 行：{err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatPill label="题库数" value={banks.length} />
        <StatPill label="题目总数" value={stats.total} />
        <StatPill label="有效题目" value={stats.active} />
        <div>
          <label className="text-xs text-brand-muted">选择题库</label>
          <select
            className="mt-1 w-full rounded-md border border-brand-muted/30 bg-brand-surface px-3 py-2 text-sm"
            value={selectedBankId ?? ''}
            onChange={(e) => setSelectedBankId(e.target.value || undefined)}
          >
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="搜索题目"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="rounded-md border border-brand-muted/30 bg-brand-surface px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">全部分类</option>
          {pageData?.categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => void refreshQuestions()} disabled={loading}>
          刷新
        </Button>
      </div>

      <div className="overflow-auto rounded-xl border border-brand-muted/20">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-brand-bg/60 text-brand-muted">
            <tr>
              <th className="px-4 py-3">题目</th>
              <th className="px-4 py-3">分类</th>
              <th className="px-4 py-3">难度</th>
              <th className="px-4 py-3">分值</th>
            </tr>
          </thead>
          <tbody>
            {pageData?.items.map((item) => (
              <tr key={item.id} className="border-t border-brand-muted/10">
                <td className="px-4 py-2">{item.text}</td>
                <td className="px-4 py-2">{item.category}</td>
                <td className="px-4 py-2">{item.difficulty}</td>
                <td className="px-4 py-2">{item.points}</td>
              </tr>
            ))}
            {!pageData?.items.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-muted">
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
