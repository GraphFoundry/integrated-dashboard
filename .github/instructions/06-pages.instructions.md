---
name: Page Components
description: 'Page component architecture and patterns'
applyTo: 'src/pages/**/*.tsx'
---

# Page Component Standards

## Core Principles

1. **Orchestration Only** - Pages coordinate, don't implement
2. **Feature Isolation** - Each page owns its feature
3. **Co-located Files** - Keep related files together
4. **Route-Level Code Splitting** - Lazy load pages

## Page Structure

```
src/pages/
├── alerts/
│   ├── Alerts.tsx              # Main page component
│   ├── AlertDetail.tsx         # Detail page
│   ├── components/             # Page-specific components
│   │   ├── AlertsTable.tsx
│   │   └── AlertFilters.tsx
│   └── hooks/                  # Page-specific hooks
│       └── useAlertFilters.ts
├── metrics/
│   ├── Metrics.tsx
│   └── components/
└── overview/
    └── Overview.tsx
```

## Page Component Template

```tsx
// src/pages/alerts/Alerts.tsx
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Section } from '@/components/layout/Section';
import { EmptyState } from '@/components/layout/EmptyState';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertsTable } from './components/AlertsTable';
import { AlertFilters } from './components/AlertFilters';
import type { AlertFilters as AlertFiltersType } from '@/lib/types';

export function AlertsPage() {
  // 1. Local state for page-level concerns
  const [filters, setFilters] = useState<AlertFiltersType>({});
  
  // 2. Data fetching via hooks
  const { data: alerts, isLoading, error, refetch } = useAlerts(filters);
  
  // 3. Event handlers
  const handleFilterChange = (newFilters: AlertFiltersType) => {
    setFilters(newFilters);
  };
  
  // 4. Render
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Monitor and manage system alerts"
        actions={
          <button onClick={refetch} className="btn-primary">
            Refresh
          </button>
        }
      />
      
      <Section>
        <AlertFilters
          value={filters}
          onChange={handleFilterChange}
        />
      </Section>
      
      <Section>
        {isLoading ? (
          <AlertsTableSkeleton />
        ) : error ? (
          <ErrorMessage error={error} onRetry={refetch} />
        ) : !alerts?.length ? (
          <EmptyState
            icon={AlertIcon}
            title="No alerts"
            description="No alerts match your current filters"
          />
        ) : (
          <AlertsTable alerts={alerts} />
        )}
      </Section>
    </div>
  );
}
```

## Route Configuration

```tsx
// src/app/routes.tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { PageLoader } from '@/components/common/PageLoader';

// Lazy load pages for code splitting
const AlertsPage = lazy(() => import('@/pages/alerts/Alerts'));
const MetricsPage = lazy(() => import('@/pages/metrics/Metrics'));
const OverviewPage = lazy(() => import('@/pages/overview/Overview'));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/alerts/:id" element={<AlertDetailPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
      </Routes>
    </Suspense>
  );
}
```

## Page Responsibilities

### ✅ Pages SHOULD

- Coordinate child components
- Manage page-level state (filters, selections)
- Handle routing logic
- Compose layout components
- Define page metadata (title, description)

### ❌ Pages SHOULD NOT

- Contain complex business logic
- Implement detailed UI components
- Make direct API calls (use hooks)
- Have more than 200 lines
- Export multiple components

## Layout Composition

```tsx
// Standard page layout pattern
export function DashboardPage() {
  return (
    <>
      {/* 1. Page Header */}
      <PageHeader
        title="Dashboard"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
      />
      
      {/* 2. Main Content */}
      <main className="grid gap-6 lg:grid-cols-3">
        {/* Primary content - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          <Section title="Key Metrics">
            <MetricsGrid />
          </Section>
          
          <Section title="Recent Activity">
            <ActivityFeed />
          </Section>
        </div>
        
        {/* Sidebar - 1/3 width */}
        <aside className="space-y-6">
          <Section title="Alerts">
            <AlertsSummary />
          </Section>
        </aside>
      </main>
    </>
  );
}
```

## URL State Management

```tsx
// Use URL for filterable/shareable state
import { useSearchParams } from 'react-router-dom';

export function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filters = {
    severity: searchParams.get('severity') || undefined,
    status: searchParams.get('status') || undefined,
  };
  
  const handleFilterChange = (key: string, value: string | null) => {
    setSearchParams(prev => {
      if (value) {
        prev.set(key, value);
      } else {
        prev.delete(key);
      }
      return prev;
    });
  };
  
  return (/* ... */);
}
```

## Best Practices

### Keep Pages Thin
```tsx
// ✅ Good: Page orchestrates
export function AlertsPage() {
  const { data, isLoading } = useAlerts();
  return <AlertsView data={data} isLoading={isLoading} />;
}

// ❌ Bad: Page does everything
export function AlertsPage() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch('/api/alerts')
      .then(res => res.json())
      .then(data => {
        // 50 lines of data transformation
        setData(transformed);
      });
  }, []);
  
  return (
    // 200 lines of JSX
  );
}
```

### Use Consistent Error Boundaries
```tsx
// Wrap pages with error boundaries
<ErrorBoundary fallback={<PageError />}>
  <AlertsPage />
</ErrorBoundary>
```

## References

- [Components Instructions](./02-components.instructions.md)
- [State Management Instructions](./04-state-management.instructions.md)
