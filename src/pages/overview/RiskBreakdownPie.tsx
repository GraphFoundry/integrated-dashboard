import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ServiceRisk } from '@/lib/risk'

interface RiskDistributionPieProps {
  risks: ServiceRisk[]
}

export default function RiskDistributionPie({ risks }: RiskDistributionPieProps) {
  const data = [
    {
      name: 'Critical',
      value: risks.filter((r) => r.riskLevel === 'high').length,
      color: '#ef4444',
    }, // red-500
    {
      name: 'Warning',
      value: risks.filter((r) => r.riskLevel === 'medium').length,
      color: '#eab308',
    }, // yellow-500
    { name: 'Healthy', value: risks.filter((r) => r.riskLevel === 'low').length, color: '#22c55e' }, // green-500
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <div className="h-[450px] flex items-center justify-center text-slate-500 text-sm">
        No risk data available
      </div>
    )
  }

  return (
    <div className="h-[450px] w-full flex flex-col">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0)" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                color: '#f1f5f9',
              }}
              formatter={(value: number, name: string) => [`${value} Services`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 pb-4">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-sm text-slate-300">
              {item.name} ({item.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
