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
  yAxisLabel?: string
  xAxisLabel?: string
}

export default function LatencyMultiLineChart({
  data,
  height = 200,
  yAxisLabel,
  xAxisLabel,
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
        <div className="bg-firebase-card border border-firebase-border rounded-lg p-3 shadow-lg">
          <p className="text-xs text-firebase-text-secondary mb-2">
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
      <LineChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatXAxis}
          stroke="#5f6368"
          tick={{ fill: '#9aa0a6', fontSize: 12 }}
          label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -10, fill: '#9aa0a6', fontSize: 12 } : undefined}
        />
        <YAxis
          stroke="#5f6368"
          tick={{ fill: '#9aa0a6', fontSize: 12 }}
          tickFormatter={formatMs}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fill: '#9aa0a6', fontSize: 12, style: { textAnchor: 'middle' } } : undefined}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '12px', color: '#9aa0a6' }} />
        {data.some((d) => d.p50 !== undefined) && (
          <Line
            type="monotone"
            dataKey="p50"
            name="P50"
            stroke="#1e8e3e"
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
            stroke="#f9ab00"
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
            stroke="#d93025"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
