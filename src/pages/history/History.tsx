import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw, History as HistoryIcon, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  iconActionButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/common/uiClassTokens'
import { getDecisionHistory } from '@/lib/api'
import { formatShortDate } from '@/lib/format'
import type { DecisionRecord } from '@/lib/types'

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
    high: 'bg-green-900/30 text-green-300 border-green-700',
    medium: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
    low: 'bg-red-900/30 text-red-300 border-red-700',
  }

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[confidence] || 'bg-slate-700 text-slate-300'}`}
    >
      {confidence}
    </span>
  )
}

export default function History() {
  const navigate = useNavigate()
  const [data, setData] = useState<{ decisions: DecisionRecord[]; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(0)

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch decision history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter])

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="History"
        description="Prediction history and decision logs"
        icon={HistoryIcon}
      />

      {/* Filters */}
      <Section icon={Filter}>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="type-filter" className={controlLabelClass}>
              Filter by Type
            </label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(0)
              }}
              className={controlInputMutedClass}
            >
              <option value="">All Types</option>
              <option value="failure">Failure</option>
              <option value="scaling">Scaling</option>
              <option value="scale">Scale</option>
            </select>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className={cn(iconActionButtonClass, 'h-[42px] w-[42px] cursor-pointer p-2.5')}
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </Section>

      {/* History List */}
      {data && data.decisions.length > 0 && (
        <Section>
          <div className="space-y-3">
            {data.decisions.map((record) => (
              <div
                key={record.id}
                className="flex items-start justify-between p-4 bg-slate-900 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white font-medium">{getScenarioSummary(record)}</span>
                    {getConfidenceBadge(record.result)}
                  </div>
                  <p className="text-sm text-slate-400">{formatShortDate(record.timestamp)}</p>
                </div>
                <button
                  onClick={() => navigate(`/history/${record.id}`)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                >
                  View Details
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-slate-400">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.total)} of{' '}
              {data.total} decisions
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className={secondaryButtonClass}
              >
                Previous
              </button>
              <button
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

      {/* Empty State */}
      {!loading && data?.decisions.length === 0 && (
        <EmptyState
          icon="📜"
          message="No decision history found"
          action={
            typeFilter ? (
              <button
                onClick={() => setTypeFilter('')}
                className={primaryButtonClass}
              >
                Clear Filters
              </button>
            ) : undefined
          }
        />
      )}

      {loading && (
        <div className="rounded-xl border border-firebase-border bg-firebase-card p-12 text-center">
          <LoadingSpinner fullHeight={false} message="Loading history..." />
        </div>
      )}
    </div>
  )
}
