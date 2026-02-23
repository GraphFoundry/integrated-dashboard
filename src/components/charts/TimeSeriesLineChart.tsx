import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  timestamp: string
  value?: number | null
}

interface TimeSeriesLineChartProps {
  data: DataPoint[]
  dataKey?: string
  strokeColor?: string
  fillColor?: string
  valueFormatter?: (value: number) => string
  height?: number
  yAxisLabel?: string
  xAxisLabel?: string
}

export default function TimeSeriesLineChart({
  data,
  dataKey = 'value',
  strokeColor = '#3b82f6',
  fillColor = '#3b82f6',
  valueFormatter,
  height = 200,
  yAxisLabel,
  xAxisLabel,
}: Readonly<TimeSeriesLineChartProps>) {
  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ value?: number | null; payload: DataPoint }>
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const numericValue = typeof data.value === 'number' && Number.isFinite(data.value)
        ? data.value
        : null
      return (
        <div className="rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 shadow-lg">
          <p className="mb-1 text-xs text-[var(--text-muted)]">
            {new Date(data.payload.timestamp).toLocaleString()}
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {numericValue !== null
              ? (valueFormatter ? valueFormatter(numericValue) : numericValue.toFixed(2))
              : 'N/A'}
          </p>
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
          label={
            xAxisLabel
              ? {
                value: xAxisLabel,
                position: 'insideBottom',
                offset: -5,
                fill: 'var(--chart-axis-label)',
                fontSize: 12,
              }
              : undefined
          }
        />
        <YAxis
          stroke="var(--chart-axis)"
          tick={{ fill: 'var(--chart-axis-label)', fontSize: 12 }}
          tickFormatter={valueFormatter}
          label={
            yAxisLabel
              ? {
                value: yAxisLabel,
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--chart-axis-label)',
                fontSize: 12,
                style: { textAnchor: 'middle' },
              }
              : undefined
          }
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={strokeColor}
          fill={fillColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: fillColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
