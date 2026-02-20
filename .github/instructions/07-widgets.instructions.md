---
name: Widget Components
description: 'Widget component patterns for self-contained features'
applyTo: 'src/widgets/**/*.tsx'
---

# Widget Standards

## Core Principles

1. **Self-Contained** - Widgets manage their own data and state
2. **Encapsulated** - Internal components stay internal
3. **Configurable** - Accept props for customization
4. **Plug-and-Play** - Drop into any page

## Widget vs Component

| Aspect | Widget | Component |
|--------|--------|-----------|
| Data fetching | Manages own data | Receives via props |
| State | Internal state | Controlled by parent |
| Complexity | Feature-complete | Single purpose |
| Reusability | Page-level | Everywhere |
| Location | `src/widgets/` | `src/components/` |

## Widget Structure

```
src/widgets/
└── alerts/
    ├── AlertsWidget.tsx      # Main widget component
    ├── components/           # Internal components
    │   ├── AlertItem.tsx
    │   └── AlertList.tsx
    ├── hooks/
    │   └── useAlertPolling.ts
    ├── types.ts              # Widget-specific types
    └── index.ts              # Public exports only
```

## Widget Template

```tsx
// src/widgets/alerts/AlertsWidget.tsx
import { useAlerts } from './hooks/useAlertPolling';
import { AlertList } from './components/AlertList';
import { EmptyState } from '@/components/layout/EmptyState';
import type { AlertsWidgetProps } from './types';

export function AlertsWidget({
  limit = 5,
  severity,
  onAlertClick,
  className,
}: AlertsWidgetProps) {
  // Widget manages its own data
  const { alerts, isLoading, error } = useAlerts({ limit, severity });

  if (isLoading) {
    return <AlertsWidgetSkeleton />;
  }

  if (error) {
    return (
      <WidgetError
        title="Failed to load alerts"
        onRetry={() => refetch()}
      />
    );
  }

  if (!alerts?.length) {
    return (
      <EmptyState
        icon={BellIcon}
        title="No alerts"
        description="No active alerts at this time"
      />
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <AlertList alerts={alerts} onItemClick={onAlertClick} />
    </div>
  );
}
```

## Types File

```typescript
// src/widgets/alerts/types.ts
import type { AlertSeverity } from '@/lib/types';

export interface AlertsWidgetProps {
  /** Maximum number of alerts to display */
  limit?: number;
  /** Filter by severity */
  severity?: AlertSeverity;
  /** Callback when an alert is clicked */
  onAlertClick?: (alertId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

// Internal types (not exported from index.ts)
export interface AlertItemProps {
  alert: Alert;
  onClick?: () => void;
}
```

## Barrel Export

```typescript
// src/widgets/alerts/index.ts
// Only export public API
export { AlertsWidget } from './AlertsWidget';
export type { AlertsWidgetProps } from './types';

// DO NOT export internal components
// ❌ export { AlertItem } from './components/AlertItem';
```

## Widget Patterns

### Data Fetching Widget
```tsx
export function MetricsWidget({ refreshInterval = 30000 }: MetricsWidgetProps) {
  const { metrics, isLoading, refetch } = useMetrics();

  // Auto-refresh
  useEffect(() => {
    const timer = setInterval(refetch, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval, refetch]);

  return (/* ... */);
}
```

### Interactive Widget
```tsx
export function ServiceHealthWidget({ serviceId }: ServiceHealthWidgetProps) {
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const { data } = useServiceHealth(serviceId);

  return (
    <div>
      <MetricsList
        metrics={data?.metrics}
        onSelect={setSelectedMetric}
      />
      {selectedMetric && (
        <MetricDetail metric={selectedMetric} />
      )}
    </div>
  );
}
```

### Configurable Widget
```tsx
interface ChartWidgetProps {
  title: string;
  dataSource: 'cpu' | 'memory' | 'network';
  timeRange?: '1h' | '24h' | '7d';
  showLegend?: boolean;
}

export function ChartWidget({
  title,
  dataSource,
  timeRange = '24h',
  showLegend = true,
}: ChartWidgetProps) {
  const { data } = useChartData(dataSource, timeRange);
  
  return (
    <Card>
      <CardHeader>
        <h3>{title}</h3>
      </CardHeader>
      <CardBody>
        <LineChart data={data} showLegend={showLegend} />
      </CardBody>
    </Card>
  );
}
```

## Usage in Pages

```tsx
// src/pages/overview/Overview.tsx
import { AlertsWidget } from '@/widgets/alerts';
import { MetricsWidget } from '@/widgets/metrics';
import { ServiceHealthWidget } from '@/widgets/service-health';

export function OverviewPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <MetricsWidget timeRange="24h" />
      </div>
      
      <aside>
        <AlertsWidget 
          limit={5} 
          onAlertClick={(id) => navigate(`/alerts/${id}`)}
        />
      </aside>
      
      <div className="lg:col-span-3">
        <ServiceHealthWidget />
      </div>
    </div>
  );
}
```

## Best Practices

### Keep Internal Components Private
```typescript
// ✅ Good: Only export widget
export { AlertsWidget } from './AlertsWidget';

// ❌ Bad: Exposing internals
export { AlertItem } from './components/AlertItem';
```

### Document Props with JSDoc
```typescript
interface WidgetProps {
  /** Maximum number of items to display. Default: 10 */
  limit?: number;
  /** Callback fired when data is loaded */
  onLoad?: (data: Data[]) => void;
}
```

### Support className for Custom Styling
```tsx
<AlertsWidget className="custom-widget-class" />
```

## References

- [Components Instructions](./02-components.instructions.md)
- [Hooks Instructions](./03-hooks.instructions.md)
