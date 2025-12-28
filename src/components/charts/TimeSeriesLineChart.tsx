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
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-xs text-slate-400 mb-1">
            {new Date(data.payload.timestamp).toLocaleString()}
          </p>
          <p className="text-sm font-medium text-white">
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
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatXAxis}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          label={
            xAxisLabel
              ? {
                value: xAxisLabel,
                position: 'insideBottom',
                offset: -5,
                fill: '#94a3b8',
                fontSize: 12,
              }
              : undefined
          }
        />
        <YAxis
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          tickFormatter={valueFormatter}
          label={
            yAxisLabel
              ? {
                value: yAxisLabel,
                angle: -90,
                position: 'insideLeft',
                fill: '#94a3b8',
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
