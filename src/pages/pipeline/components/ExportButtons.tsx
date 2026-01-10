import { useState } from 'react'
import type { PipelineTrace, FailureResponse, ScaleResponse } from '@/lib/types'

interface ExportButtonsProps {
  readonly trace: PipelineTrace | null
  readonly fullResponse: FailureResponse | ScaleResponse | null
}

export default function ExportButtons({ trace, fullResponse }: ExportButtonsProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const copyToClipboard = async (data: object, label: string) => {
    const json = JSON.stringify(data, null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setCopyStatus(`${label} copied!`)
      setTimeout(() => setCopyStatus(null), 2000)
    } catch {
      // Fallback for browsers that block clipboard
      setCopyStatus('Copy blocked - use download instead')
      setTimeout(() => setCopyStatus(null), 3000)
    }
  }

  const downloadJson = (data: object, filename: string) => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const hasData = trace || fullResponse

  if (!hasData) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Export</h3>
        <p className="text-sm text-slate-400">Run a simulation to enable export options.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-3">Export</h3>

      {/* Status message */}
      {copyStatus && (
        <div className="mb-3 px-3 py-2 bg-green-900/20 border border-green-700 rounded text-green-400 text-sm">
          {copyStatus}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Copy Trace */}
        <button
          onClick={() => trace && copyToClipboard(trace, 'Trace JSON')}
          disabled={!trace}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-850 disabled:text-slate-500 text-white text-sm rounded transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy Trace
        </button>

        {/* Copy Full Response */}
        <button
          onClick={() => fullResponse && copyToClipboard(fullResponse, 'Full Response')}
          disabled={!fullResponse}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-850 disabled:text-slate-500 text-white text-sm rounded transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy Response
        </button>

        {/* Download Trace */}
        <button
          onClick={() => trace && downloadJson(trace, `pipeline-trace-${Date.now()}.json`)}
          disabled={!trace}
          className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 disabled:bg-slate-850 disabled:text-slate-500 text-blue-400 text-sm rounded transition-colors flex items-center justify-center gap-2 border border-blue-600/30"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Download Trace
        </button>

        {/* Download Full Response */}
        <button
          onClick={() =>
            fullResponse && downloadJson(fullResponse, `simulation-response-${Date.now()}.json`)
          }
          disabled={!fullResponse}
          className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 disabled:bg-slate-850 disabled:text-slate-500 text-blue-400 text-sm rounded transition-colors flex items-center justify-center gap-2 border border-blue-600/30"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Download Response
        </button>
      </div>

      {/* Data sizes */}
      <div className="mt-3 text-xs text-slate-500 flex justify-between">
        {trace && <span>Trace: {JSON.stringify(trace).length.toLocaleString()} bytes</span>}
        {fullResponse && (
          <span>Response: {JSON.stringify(fullResponse).length.toLocaleString()} bytes</span>
        )}
      </div>
    </div>
  )
}
