import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { Download, Filter, History as HistoryIcon, RefreshCw, Share2, SplitSquareHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  loadingCardClass,
  pageContainerClass,
  primaryButtonClass,
  secondaryButtonClass,
  subtleIconButtonClass,
  tableActionLinkClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeadStickyClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import { Checkbox, Select } from '@/components/ui'
import { compareDecisions, exportDecision, getDecisionHistory } from '@/lib/api'
import { formatShortDate } from '@/lib/format'
import type { DecisionCompareResponse, DecisionRecord } from '@/lib/types'

function getScenarioSummary(record: DecisionRecord): string {
  const { type, scenario, result } = record

  if (type === 'failure') {
    const serviceId = scenario.serviceId as string | undefined
    const callers = result.affectedCallers as unknown[] | undefined
    const downstream = result.affectedDownstream as unknown[] | undefined
    const affectedCount = (callers?.length ?? 0) + (downstream?.length ?? 0)
    return `Failure: ${serviceId} — ${affectedCount} services impacted`
  }

  if (type === 'scaling' || type === 'scale') {
    const serviceId = scenario.serviceId as string | undefined
    const currentPods = scenario.currentPods as number | undefined
    const newPods = scenario.newPods as number | undefined
    return `Scale: ${serviceId} (${currentPods ?? '?'}→${newPods ?? '?'} pods)`
  }

  return `${type}: ${(scenario.serviceId as string) ?? 'unknown'}`
}

function getConfidenceBadge(result: Record<string, unknown>) {
  const confidence = result.confidence as string | undefined
  if (!confidence) return null

  const colors: Record<string, string> = {
    high: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/45',
    medium: 'bg-amber-500/12 text-amber-700 border-amber-500/45',
    low: 'bg-rose-500/12 text-rose-700 border-rose-500/45',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        colors[confidence] || 'bg-[var(--surface-soft)] text-[var(--text-secondary)]'
      }`}
    >
      {confidence}
    </span>
  )
}

export default function History() {
  const navigate = useNavigate()
  const [data, setData] = useState<{ decisions: DecisionRecord[]; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [compareResult, setCompareResult] = useState<DecisionCompareResponse | null>(null)

  const pageSize = 20

  const fetchData = async () => {
    setLoading(true)

    try {
      const result = await getDecisionHistory({
        limit: pageSize,
        offset: page * pageSize,
        type: typeFilter || undefined,
      })

      setData({ decisions: result.decisions, total: result.pagination.total })
      setSelectedIds([])
      setCompareResult(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch decision history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter])

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  const selectedRecords = useMemo(() => {
    if (!data) return []
    return data.decisions.filter((record) => selectedIds.includes(record.id))
  }, [data, selectedIds])

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id)
      }
      if (prev.length >= 2) {
        return [prev[1], id]
      }
      return [...prev, id]
    })
  }

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, id: number) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, summary, details, label, [role="checkbox"]')) {
      return
    }
    toggleSelection(id)
  }

  const runCompare = async () => {
    if (selectedIds.length !== 2) {
      toast.error('Select exactly two runs to compare')
      return
    }
    setComparing(true)
    try {
      const result = await compareDecisions(selectedIds[0], selectedIds[1])
      setCompareResult(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to compare runs')
    } finally {
      setComparing(false)
    }
  }

  const handleExport = async (id: number, format: 'json' | 'csv') => {
    try {
      const blob = await exportDecision(id, format)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `decision-${id}.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed')
    }
  }

  const copyShareLink = async (id: number) => {
    const link = `${window.location.origin}/history/${id}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Share link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <div className={pageContainerClass} aria-busy={loading && !data}>
      <PageHeader
        title="History"
        description="Decision audit trail, run comparison, and exportable evidence"
        icon={HistoryIcon}
      />

      <Section icon={Filter}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="type-filter" className={controlLabelClass}>
              Filter by Type
            </label>
            <Select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(0)
              }}
              className={controlInputMutedClass}
              suffixIcon={<Filter className="h-4 w-4" />}
            >
              <option value="">All Types</option>
              <option value="failure">Failure</option>
              <option value="scaling">Scaling</option>
              <option value="scale">Scale</option>
            </Select>
          </div>

          <button
            type="button"
            onClick={runCompare}
            disabled={selectedIds.length !== 2 || comparing}
            className={cn(primaryButtonClass, 'inline-flex items-center gap-2 disabled:opacity-50')}
          >
            <SplitSquareHorizontal className="h-4 w-4" />
            Compare Selected
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className={cn(subtleIconButtonClass)}
            title="Refresh data"
            aria-label="Refresh history data"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Select two runs to compare changes in plain language. Share links are panel-friendly; raw exports stay under advanced actions.
        </p>
      </Section>

      {compareResult && (
        <Section title="Run Comparison" icon={SplitSquareHorizontal}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3" title="How many more or fewer services are impacted between selected runs.">
              <div className="text-xs text-[var(--text-dim)]">Difference in impacted services</div>
              <div className="text-xl font-semibold text-[var(--text-primary)]">
                {compareResult.summary.affectedServicesDelta >= 0 ? '+' : ''}
                {compareResult.summary.affectedServicesDelta}
              </div>
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3" title="Whether the confidence level changed between selected runs.">
              <div className="text-xs text-[var(--text-dim)]">Confidence changed</div>
              <div className="text-xl font-semibold text-[var(--text-primary)]">
                {compareResult.summary.confidenceChanged ? 'Yes' : 'No'}
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {compareResult.summary.leftConfidence ?? 'n/a'} → {compareResult.summary.rightConfidence ?? 'n/a'}
              </div>
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3" title="Difference in expected response-time impact between selected runs.">
              <div className="text-xs text-[var(--text-dim)]">Difference in response-time change</div>
              <div className="text-xl font-semibold text-[var(--text-primary)]">
                {compareResult.summary.latencyDeltaDiffMs === null ||
                compareResult.summary.latencyDeltaDiffMs === undefined
                  ? 'n/a'
                  : `${compareResult.summary.latencyDeltaDiffMs >= 0 ? '+' : ''}${compareResult.summary.latencyDeltaDiffMs.toFixed(2)} ms`}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
              <div className="mb-1 text-xs text-[var(--text-dim)]">Left Run</div>
              #{compareResult.left.id} · {compareResult.left.type} ·{' '}
              {formatShortDate(compareResult.left.timestamp)}
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
              <div className="mb-1 text-xs text-[var(--text-dim)]">Right Run</div>
              #{compareResult.right.id} · {compareResult.right.type} ·{' '}
              {formatShortDate(compareResult.right.timestamp)}
            </div>
          </div>
        </Section>
      )}

      {data && data.decisions.length > 0 && (
        <Section>
          <div className={tableShellClass}>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full">
                <thead className={cn(tableHeadRowClass, tableHeadStickyClass)}>
                  <tr>
                    <th className={tableHeaderCellClass}>Select</th>
                    <th className={tableHeaderCellClass}>Scenario</th>
                    <th className={tableHeaderCellClass}>Type</th>
                    <th className={tableHeaderCellClass}>Confidence</th>
                    <th className={tableHeaderCellClass}>Timestamp</th>
                    <th className={tableHeaderCellClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.decisions.map((record) => (
                    <tr
                      key={record.id}
                      className={cn(tableBodyRowClass, 'cursor-pointer transition-colors')}
                      onClick={(event) => handleRowClick(event, record.id)}
                    >
                      <td className={tableCellClass}>
                        <Checkbox
                          aria-label={`Select decision run ${record.id}`}
                          checked={selectedIds.includes(record.id)}
                          onChange={() => toggleSelection(record.id)}
                          className="inline-flex"
                        />
                      </td>
                      <td className={cn(tableCellClass, 'font-medium text-[var(--text-primary)]')}>
                        {getScenarioSummary(record)}
                      </td>
                      <td className={tableCellClass}>
                        <span className="capitalize text-[var(--text-secondary)]">{record.type}</span>
                      </td>
                      <td className={tableCellClass}>{getConfidenceBadge(record.result) ?? '—'}</td>
                      <td className={cn(tableCellClass, 'font-mono text-xs')}>
                        {formatShortDate(record.timestamp)}
                      </td>
                      <td className={cn(tableCellClass, 'space-x-3')}>
                        <button
                          type="button"
                          onClick={() => navigate(`/history/${record.id}`)}
                          className={tableActionLinkClass}
                        >
                          Open details
                        </button>
                        <button
                          type="button"
                          onClick={() => copyShareLink(record.id)}
                          className={tableActionLinkClass}
                          title="Copy share link"
                        >
                          <Share2 className="mr-1 inline h-3.5 w-3.5" />
                          Share link
                        </button>
                        <details className="relative inline-block">
                          <summary className={cn(tableActionLinkClass, 'list-none cursor-pointer')}>Advanced export</summary>
                          <div className="absolute right-0 z-10 mt-2 min-w-40 rounded border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleExport(record.id, 'json')}
                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
                              title="Export technical JSON record"
                            >
                              <Download className="h-3.5 w-3.5" />
                              JSON file
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExport(record.id, 'csv')}
                              className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
                              title="Export tabular CSV record"
                            >
                              <Download className="h-3.5 w-3.5" />
                              CSV file
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--text-muted)]">
            Selected: {selectedRecords.map((record) => `#${record.id}`).join(', ') || 'none'}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-[var(--text-muted)]">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.total)} of {data.total}{' '}
              decisions
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className={secondaryButtonClass}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
                className={secondaryButtonClass}
              >
                Next
              </button>
            </div>
          </div>
        </Section>
      )}

      {loading && !data && (
        <Section>
          <div className={tableShellClass} aria-busy="true">
            <div className="max-h-[560px] overflow-auto p-4">
              <SkeletonBlock variant="line" className="mb-4 h-8 w-full" />
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonBlock
                  key={`history-row-skeleton-${index}`}
                  variant="table-row"
                  className="mb-3 h-12 w-full"
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      {!loading && data?.decisions.length === 0 && (
        <EmptyState
          icon={null}
          message="No decision history found"
          action={
            typeFilter ? (
              <button type="button" onClick={() => setTypeFilter('')} className={primaryButtonClass}>
                Clear Filters
              </button>
            ) : undefined
          }
        />
      )}

      {loading && data && (
        <div className={loadingCardClass}>
          <LoadingSpinner fullHeight={false} message="Loading history..." />
        </div>
      )}
    </div>
  )
}
