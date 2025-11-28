import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface DataPoint {
  timestamp: string
  p50?: number
  p95?: number
  p99?: number
}

interface LatencyMultiLineChartProps {
  data: DataPoint[]
  height?: number
}

export default function LatencyMultiLineChart({
  data,
  height = 200,
}: Readonly<LatencyMultiLineChartProps>) {
  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatMs = (value: number) => `${value.toFixed(0)}ms`

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ name: string; value: number; payload: DataPoint; color?: string }>
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-xs text-slate-400 mb-2">
            {new Date(payload[0].payload.timestamp).toLocaleString()}
          </p>
          {payload.map((entry) => (
            <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {formatMs(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatXAxis}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
        />
        <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatMs} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
        {data.some((d) => d.p50 !== undefined) && (
          <Line
            type="monotone"
            dataKey="p50"
            name="P50"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}
        {data.some((d) => d.p95 !== undefined) && (
          <Line
            type="monotone"
            dataKey="p95"
            name="P95"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}
        {data.some((d) => d.p99 !== undefined) && (
          <Line
            type="monotone"
            dataKey="p99"
            name="P99"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
