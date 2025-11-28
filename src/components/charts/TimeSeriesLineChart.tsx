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
}

export default function TimeSeriesLineChart({
  data,
  dataKey = 'value',
  strokeColor = '#3b82f6',
  fillColor = '#3b82f6',
  valueFormatter,
  height = 200,
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
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatXAxis}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
        />
        <YAxis
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          tickFormatter={valueFormatter}
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
