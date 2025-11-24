import { useState, useEffect } from 'react'
import { getDecisionHistory } from '@/lib/api'

interface Decision {
  id: number
  timestamp: string
  type: string
  scenario: Record<string, any>
  result: Record<string, any>
  correlationId: string | null
  createdAt: string
}

interface DecisionHistoryResponse {
  decisions: Decision[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export default function DecisionLogs() {
  const [data, setData] = useState<DecisionHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(0)
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null)

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

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch decision logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, typeFilter])

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString()
  }

  const totalPages = data ? Math.ceil(data.pagination.total / pageSize) : 0

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Decision Logs</h1>
        <p className="text-slate-400 mt-1">Simulation decisions logged from Pipeline Playground</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Filter by Type
            </label>
            <select
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
              <option value="risk">Risk</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Table */}
      {data && data.decisions.length > 0 && (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Correlation ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {data.decisions.map((decision) => (
                  <tr key={decision.id} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                      {decision.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatTimestamp(decision.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          decision.type === 'failure'
                            ? 'bg-red-900/30 text-red-300'
                            : decision.type === 'scaling'
                            ? 'bg-blue-900/30 text-blue-300'
                            : 'bg-yellow-900/30 text-yellow-300'
                        }`}
                      >
                        {decision.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                      {decision.correlationId || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelectedDecision(decision)}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
            <div className="text-sm text-slate-400">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.pagination.total)} of{' '}
              {data.pagination.total} decisions
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
        </div>
      )}

      {/* Empty State */}
      {data && data.decisions.length === 0 && (
        <div className="bg-slate-800 rounded-lg p-12 text-center">
          <p className="text-slate-400">No decision logs found</p>
        </div>
      )}

      {/* Modal for Decision Details */}
      {selectedDecision && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-8 z-50"
          onClick={() => setSelectedDecision(null)}
        >
          <div
            className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Decision Details</h2>
              <button
                onClick={() => setSelectedDecision(null)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Metadata</h3>
                <div className="bg-slate-900 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex">
                    <span className="text-slate-400 w-32">ID:</span>
                    <span className="text-white font-mono">{selectedDecision.id}</span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-400 w-32">Timestamp:</span>
                    <span className="text-white">{formatTimestamp(selectedDecision.timestamp)}</span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-400 w-32">Type:</span>
                    <span className="text-white">{selectedDecision.type}</span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-400 w-32">Correlation ID:</span>
                    <span className="text-white font-mono">{selectedDecision.correlationId || 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Scenario</h3>
                <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
                  {JSON.stringify(selectedDecision.scenario, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Result</h3>
                <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
                  {JSON.stringify(selectedDecision.result, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
