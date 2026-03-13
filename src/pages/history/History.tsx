import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Download, Filter, History as HistoryIcon, RefreshCw, Share2, SplitSquareHorizontal, Zap, Layers, TrendingUp, Database, ChevronLeft, ChevronRight, ExternalLink, ShieldCheck, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import MetricHighlightCard from '@/components/layout/MetricHighlightCard'
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
import { getDecisionScenarioServiceId, getFailureAffectedServiceCount } from '@/lib/decisionHistory'
import { formatShortDate } from '@/lib/format'
import type { DecisionCompareResponse, DecisionRecord } from '@/lib/types'

function getScenarioSummary(record: DecisionRecord): string {
  const { type, scenario, result } = record

  if (type === 'failure') {
    const serviceId = getDecisionScenarioServiceId(record)
    const affectedCount = getFailureAffectedServiceCount(result)
    return `Failure: ${serviceId} — ${affectedCount} services impacted`
  }

  if (type === 'scaling' || type === 'scale') {
    const serviceId = scenario.serviceId as string | undefined
    const currentPods = scenario.currentPods as number | undefined
    const newPods = scenario.newPods as number | undefined
    return `Scale: ${serviceId} (${currentPods ?? '?'}→${newPods ?? '?'} pods)`
  }

  if (type === 'traffic_spike') {
    const serviceId = scenario.serviceId as string | undefined
    const multiplier = scenario.loadMultiplier as number | undefined
    return `Traffic Spike: ${serviceId ?? 'unknown'}${multiplier != null ? ` (${multiplier}×)` : ''}`
  }

  if (type === 'chatty_colocation') {
    const src = scenario.sourceServiceId as string | undefined
    const tgt = scenario.serviceId as string | undefined
    return `Chatty: ${src ?? 'unknown'} → ${tgt ?? 'unknown'}`
  }

  if (type === 'network_cut') {
    const src = scenario.sourceServiceId as string | undefined
    const tgt = scenario.serviceId as string | undefined
    return `Network Cut: ${src ?? 'unknown'} → ${tgt ?? 'unknown'}`
  }

  if (type === 'add' || type === 'add-service') {
    const name = (scenario.serviceName as string | undefined) ?? (scenario.serviceId as string | undefined)
    return `Add Service: ${name ?? 'unnamed'}`
  }

  return `${type}: ${(scenario.serviceId as string) ?? 'unknown'}`
}

function getConfidenceBadge(result: Record<string, unknown>) {
  const confidence = result.confidence as string | undefined
  if (!confidence) return null

  const colors: Record<string, string> = {
    high: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/35',
    medium: 'bg-amber-500/12 text-amber-400 border-amber-500/35',
    low: 'bg-rose-500/12 text-rose-400 border-rose-500/35',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        colors[confidence] || 'bg-[var(--surface-soft)] text-[var(--text-secondary)]'
      }`}
    >
      {confidence}
    </span>
  )
}

function getTypeBadge(type: string) {
  const cfg: Record<string, { label: string; icon: ReactNode; cls: string }> = {
    failure: {
      label: 'Failure',
      icon: <Zap className="h-3 w-3" />,
      cls: 'bg-rose-500/12 text-rose-400 border-rose-500/35',
    },
    scaling: {
      label: 'Scaling',
      icon: <Layers className="h-3 w-3" />,
      cls: 'bg-cyan-500/12 text-cyan-400 border-cyan-500/35',
    },
    scale: {
      label: 'Scale',
      icon: <TrendingUp className="h-3 w-3" />,
      cls: 'bg-blue-500/12 text-blue-400 border-blue-500/35',
    },
    traffic_spike: {
      label: 'Traffic Spike',
      icon: <TrendingUp className="h-3 w-3" />,
      cls: 'bg-amber-500/12 text-amber-400 border-amber-500/35',
    },
    chatty_colocation: {
      label: 'Chatty',
      icon: <Layers className="h-3 w-3" />,
      cls: 'bg-purple-500/12 text-purple-400 border-purple-500/35',
    },
    network_cut: {
      label: 'Network Cut',
      icon: <Zap className="h-3 w-3" />,
      cls: 'bg-orange-500/12 text-orange-400 border-orange-500/35',
    },
    add: {
      label: 'Add Service',
      icon: <Layers className="h-3 w-3" />,
      cls: 'bg-violet-500/12 text-violet-400 border-violet-500/35',
    },
    'add-service': {
      label: 'Add Service',
      icon: <Layers className="h-3 w-3" />,
      cls: 'bg-violet-500/12 text-violet-400 border-violet-500/35',
    },
  }
  const c = cfg[type] ?? { label: type, icon: <Database className="h-3 w-3" />, cls: 'bg-[var(--surface-soft)] text-[var(--text-secondary)] border-[var(--border)]' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${c.cls}`}>
      {c.icon}
      {c.label}
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

  const failureCount = data?.decisions.filter((d) => d.type === 'failure').length ?? 0
  const scalingCount = data?.decisions.filter((d) => d.type === 'scaling' || d.type === 'scale').length ?? 0

  return (
    <div className={pageContainerClass} aria-busy={loading && !data}>
      <PageHeader
        title="History"
        description="Decision audit trail, run comparison, and exportable evidence"
        icon={HistoryIcon}
        actions={
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className={cn(subtleIconButtonClass)}
            title="Refresh history"
            aria-label="Refresh history data"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Stats Cards — skeleton while loading */}
      {loading && !data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4" aria-label="Loading history metrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`history-stat-skeleton-${index}`} className={cn(loadingCardClass, 'p-6 text-left')}>
              <SkeletonBlock variant="line" className="mb-3 w-2/3" />
              <SkeletonBlock variant="line" className="mb-4 w-5/6" />
              <SkeletonBlock variant="title" className="w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <MetricHighlightCard
            label="Total Decisions"
            description="All analysis runs recorded in the audit trail."
            icon={Database}
            value={data.total}
            valueClassName="text-indigo-200"
            tone="indigo"
            tooltip="Total number of decision records stored across all pages."
          />
          <MetricHighlightCard
            label="Shown on Page"
            description="Decisions visible in the current page view."
            icon={Layers}
            value={data.decisions.length}
            valueClassName="text-[var(--text-primary)]"
            tone="blue"
            tooltip="How many decision records are rendered on this page. Up to 20 per page."
          />
          <MetricHighlightCard
            label="Failure Simulations"
            description="Failure-type runs on the current page."
            icon={Zap}
            value={failureCount}
            valueClassName={failureCount > 0 ? 'text-rose-300' : 'text-emerald-300'}
            tone="rose"
            tooltip="Counts how many records on this page are failure-type simulations."
          />
          <MetricHighlightCard
            label="Scaling Simulations"
            description="Scale-type runs on the current page."
            icon={TrendingUp}
            value={scalingCount}
            valueClassName="text-amber-200"
            tone="amber"
            tooltip="Counts how many records on this page are scaling-type simulations."
          />
        </div>
      )}

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
              <option value="traffic_spike">Traffic Spike</option>
              <option value="chatty_colocation">Chatty Colocation</option>
              <option value="network_cut">Network Cut</option>
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
        </div>

        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Select two runs to compare changes in plain language. Share links are panel-friendly; raw exports stay under advanced actions.
        </p>
      </Section>

      {compareResult && (
        <Section title="Run Comparison" icon={SplitSquareHorizontal}>
          {/* Run labels */}
          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/8 to-[var(--surface-subtle)] p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-300">L</span>
              <div>
                <div className="text-xs text-[var(--text-dim)] uppercase tracking-widest">Left Run</div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                  #{compareResult.left.id} · {compareResult.left.type} · {formatShortDate(compareResult.left.timestamp)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-blue-500/25 bg-gradient-to-r from-blue-500/8 to-[var(--surface-subtle)] p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">R</span>
              <div>
                <div className="text-xs text-[var(--text-dim)] uppercase tracking-widest">Right Run</div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                  #{compareResult.right.id} · {compareResult.right.type} · {formatShortDate(compareResult.right.timestamp)}
                </div>
              </div>
            </div>
          </div>
          {/* Delta metric cards — same MetricHighlightCard style */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MetricHighlightCard
              label="Impacted Services Δ"
              description="Change in affected service count between the two runs."
              icon={Layers}
              value={`${compareResult.summary.affectedServicesDelta >= 0 ? '+' : ''}${compareResult.summary.affectedServicesDelta}`}
              valueClassName={compareResult.summary.affectedServicesDelta > 0 ? 'text-rose-300' : compareResult.summary.affectedServicesDelta < 0 ? 'text-emerald-300' : 'text-[var(--text-primary)]'}
              tone={compareResult.summary.affectedServicesDelta > 0 ? 'rose' : 'emerald'}
              tooltip="How many more or fewer services are impacted between the selected runs."
            />
            <MetricHighlightCard
              label="Confidence Changed"
              description={`${compareResult.summary.leftConfidence ?? 'n/a'} → ${compareResult.summary.rightConfidence ?? 'n/a'}`}
              icon={ShieldCheck}
              value={compareResult.summary.confidenceChanged ? 'Yes' : 'No'}
              valueClassName={compareResult.summary.confidenceChanged ? 'text-amber-300' : 'text-emerald-300'}
              tone={compareResult.summary.confidenceChanged ? 'amber' : 'emerald'}
              tooltip="Whether the confidence level changed between the selected runs."
            />
            <MetricHighlightCard
              label="Response-time Δ"
              description="Difference in expected latency impact between runs."
              icon={Clock}
              value={
                compareResult.summary.latencyDeltaDiffMs === null ||
                compareResult.summary.latencyDeltaDiffMs === undefined
                  ? 'n/a'
                  : `${compareResult.summary.latencyDeltaDiffMs >= 0 ? '+' : ''}${compareResult.summary.latencyDeltaDiffMs.toFixed(2)} ms`
              }
              valueClassName={
                compareResult.summary.latencyDeltaDiffMs == null
                  ? 'text-[var(--text-secondary)]'
                  : compareResult.summary.latencyDeltaDiffMs > 0
                    ? 'text-rose-300'
                    : 'text-emerald-300'
              }
              tone={compareResult.summary.latencyDeltaDiffMs != null && compareResult.summary.latencyDeltaDiffMs > 0 ? 'rose' : 'emerald'}
              tooltip="Difference in expected response-time impact in milliseconds between the two runs."
            />
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
                        {getTypeBadge(record.type)}
                      </td>
                      <td className={tableCellClass}>{getConfidenceBadge(record.result) ?? '—'}</td>
                      <td className={cn(tableCellClass, 'font-mono text-xs')}>
                        {formatShortDate(record.timestamp)}
                      </td>
                      <td className={cn(tableCellClass, 'space-x-3')}>
                        <button
                          type="button"
                          onClick={() => navigate(`/history/${record.id}`)}
                          className={cn(tableActionLinkClass, 'inline-flex items-center gap-1')}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => copyShareLink(record.id)}
                          className={tableActionLinkClass}
                          title="Copy share link"
                        >
                          <Share2 className="mr-1 inline h-3.5 w-3.5" />
                          Share
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

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[var(--text-muted)]">
              Showing{' '}
              <span className="font-semibold text-[var(--text-secondary)]">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.total)}</span>
              {' '}of{' '}
              <span className="font-semibold text-[var(--text-secondary)]">{data.total}</span> decisions
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className={cn(secondaryButtonClass, 'inline-flex items-center gap-1.5 px-3')}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <span className="min-w-[5rem] rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-center text-sm font-semibold text-[var(--text-primary)]">
                {page + 1} / {totalPages || 1}
              </span>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
                className={cn(secondaryButtonClass, 'inline-flex items-center gap-1.5 px-3')}
              >
                Next
                <ChevronRight className="h-4 w-4" />
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
