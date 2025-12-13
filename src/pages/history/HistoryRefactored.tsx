import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
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

export default function HistoryRefactored() {
  const navigate = useNavigate()
  const [data, setData] = useState<{ decisions: DecisionRecord[]; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(0)

  const pageSize = 20

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getDecisionHistory({
        limit: pageSize,
        offset: page * pageSize,
        type: typeFilter || undefined,
      })

      setData({ decisions: result.decisions, total: result.pagination.total })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch decision history')
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
    <div className="p-8 space-y-6">
      <PageHeader title="History" description="Prediction history and decision logs" />

      {/* Filters */}
      <Section>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="type-filter" className="block text-sm font-medium text-slate-300 mb-2">
              Filter by Type
            </label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(0)
              }}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors h-[42px] w-[42px] flex items-center justify-center cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </Section>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

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
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg font-medium transition-colors"
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Clear Filters
              </button>
            ) : undefined
          }
        />
      )}

      {loading && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading history...</p>
        </div>
      )}
    </div>
  )
}
