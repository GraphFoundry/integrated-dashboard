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
  value: number
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
    payload?: Array<{ value: number; payload: DataPoint }>
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      return (
        <div className="bg-firebase-card border border-firebase-border rounded-lg p-3 shadow-lg">
          <p className="text-xs text-firebase-text-secondary mb-1">
            {new Date(data.payload.timestamp).toLocaleString()}
          </p>
          <p className="text-sm font-medium text-firebase-text-primary">
            {valueFormatter ? valueFormatter(data.value) : data.value.toFixed(2)}
          </p>
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
          label={
            xAxisLabel
              ? {
                value: xAxisLabel,
                position: 'insideBottom',
                offset: -5,
                fill: '#9aa0a6',
                fontSize: 12,
              }
              : undefined
          }
        />
        <YAxis
          stroke="#5f6368"
          tick={{ fill: '#9aa0a6', fontSize: 12 }}
          tickFormatter={valueFormatter}
          label={
            yAxisLabel
              ? {
                value: yAxisLabel,
                angle: -90,
                position: 'insideLeft',
                fill: '#9aa0a6',
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
