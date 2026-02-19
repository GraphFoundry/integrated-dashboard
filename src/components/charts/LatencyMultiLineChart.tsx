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
        <div className="rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 shadow-lg">
          <p className="mb-2 text-xs text-[var(--text-muted)]">
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatXAxis}
          stroke="var(--chart-axis)"
          tick={{ fill: 'var(--chart-axis-label)', fontSize: 12 }}
          label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -10, fill: 'var(--chart-axis-label)', fontSize: 12 } : undefined}
        />
        <YAxis
          stroke="var(--chart-axis)"
          tick={{ fill: 'var(--chart-axis-label)', fontSize: 12 }}
          tickFormatter={formatMs}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fill: 'var(--chart-axis-label)', fontSize: 12, style: { textAnchor: 'middle' } } : undefined}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--chart-axis-label)' }} />
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
