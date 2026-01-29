---
agent: agent
description: Create a new chart component using Recharts
---

# Create Chart

Create a new chart component using Recharts following project patterns.

## Input Required

- **Chart Type**: `line` | `bar` | `area` | `pie` | `scatter`
- **Chart Name**: Descriptive name (e.g., `LatencyTrend`, `ErrorDistribution`)
- **Data Shape**: Structure of the data to visualize

## Directory Location

```
src/components/charts/{ChartName}Chart.tsx
```

## Chart Template

```tsx
import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { ${ChartName}Data } from '@/lib/types';

interface ${ChartName}ChartProps {
  /** Data points to render */
  data: ${ChartName}Data[];
  /** Chart height in pixels */
  height?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};

export function ${ChartName}Chart({
  data,
  height = 300,
  showLegend = true,
  className,
}: ${ChartName}ChartProps) {
  // Memoize formatted data if transformation needed
  const chartData = useMemo(() => {
    return data.map(item => ({
      ...item,
      formattedDate: formatDate(item.timestamp),
    }));
  }, [data]);

  if (!data?.length) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ height }}>
        <span className="text-gray-500">No data available</span>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
          <XAxis 
            dataKey="formattedDate" 
            tick={{ fontSize: 12 }}
            className="text-gray-600"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            className="text-gray-600"
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
          />
          {showLegend && <Legend />}
          <Line
            type="monotone"
            dataKey="value"
            stroke={COLORS.primary}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

## Chart Type Examples

### Line Chart (Time Series)
```tsx
<LineChart data={data}>
  <Line type="monotone" dataKey="value" stroke="#3b82f6" />
</LineChart>
```

### Bar Chart (Comparison)
```tsx
<BarChart data={data}>
  <Bar dataKey="value" fill="#3b82f6" />
</BarChart>
```

### Area Chart (Volume)
```tsx
<AreaChart data={data}>
  <Area type="monotone" dataKey="value" fill="#3b82f6" fillOpacity={0.3} />
</AreaChart>
```

### Pie Chart (Distribution)
```tsx
<PieChart>
  <Pie
    data={data}
    dataKey="value"
    nameKey="name"
    cx="50%"
    cy="50%"
    innerRadius={60}
    outerRadius={80}
  >
    {data.map((entry, index) => (
      <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
</PieChart>
```

## Best Practices

### Responsive Container
```tsx
// Always wrap in ResponsiveContainer
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    {/* ... */}
  </LineChart>
</ResponsiveContainer>
```

### Memoize Data Transformations
```tsx
const chartData = useMemo(() => 
  rawData.map(transformForChart),
  [rawData]
);
```

### Custom Tooltip
```tsx
function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="bg-white border rounded-lg p-3 shadow-lg">
      <p className="font-medium">{label}</p>
      {payload.map(entry => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatValue(entry.value)}
        </p>
      ))}
    </div>
  );
}
```

### Empty State
```tsx
if (!data?.length) {
  return (
    <EmptyState
      icon={ChartIcon}
      title="No data"
      description="No data available for this time range"
    />
  );
}
```

## Checklist

- [ ] Chart component created in `src/components/charts/`
- [ ] TypeScript props interface defined
- [ ] ResponsiveContainer used for responsive sizing
- [ ] Empty state handled
- [ ] Data transformation memoized
- [ ] Colors use project design tokens
- [ ] Tooltip styled consistently
- [ ] Accessibility considered (aria-label on container)
