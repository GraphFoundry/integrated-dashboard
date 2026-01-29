---
name: React Components
description: 'React component architecture and patterns'
applyTo: 'src/components/**/*.tsx, src/pages/**/*.tsx, src/widgets/**/*.tsx'
---

# React Component Standards

## Core Principles

1. **Functional Components Only** - No class components
2. **Single Responsibility** - One component, one purpose
3. **Composition Over Props** - Prefer children and slots over config props
4. **Module-Level Definitions** - Never define components inside other components

## Component Structure Template

```tsx
// 1. Imports (grouped: React, external libs, internal)
import { useState, useCallback, useMemo } from 'react';
import { formatDate } from '@/lib/format';
import type { Alert } from '@/lib/types';

// 2. Types (props interface)
interface AlertCardProps {
  alert: Alert;
  onDismiss: (id: string) => void;
  className?: string;
}

// 3. Component (named export preferred)
export function AlertCard({ alert, onDismiss, className }: AlertCardProps) {
  // 3a. Hooks (state, refs, context)
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 3b. Derived state (useMemo for expensive)
  const formattedDate = useMemo(
    () => formatDate(alert.timestamp),
    [alert.timestamp]
  );
  
  // 3c. Callbacks (useCallback for child props)
  const handleDismiss = useCallback(() => {
    onDismiss(alert.id);
  }, [onDismiss, alert.id]);
  
  // 3d. Effects (with proper cleanup)
  
  // 3e. Early returns (loading, error, empty)
  
  // 3f. Main render
  return (
    <article className={cn('rounded-lg border p-4', className)}>
      {/* Semantic HTML with Tailwind */}
    </article>
  );
}
```

## Must-Follow Rules

### Never Define Components Inside Components
```tsx
// ❌ NEVER - Creates new component on each render
function ParentComponent() {
  function ChildComponent() {
    return <div>Child</div>;
  }
  return <ChildComponent />;
}

// ✅ Always define at module level
function ChildComponent() {
  return <div>Child</div>;
}

function ParentComponent() {
  return <ChildComponent />;
}
```

### Always Handle Loading/Error/Empty States
```tsx
// ✅ Good: Complete state handling
export function DataTable({ data, isLoading, error }: DataTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }
  
  if (error) {
    return <ErrorMessage message={error.message} />;
  }
  
  if (!data?.length) {
    return <EmptyState message="No data available" />;
  }
  
  return <table>{/* render data */}</table>;
}
```

### Use Semantic HTML Elements
```tsx
// ❌ Bad: Div soup
<div className="header">
  <div className="title">Dashboard</div>
</div>

// ✅ Good: Semantic elements
<header className="...">
  <h1 className="...">Dashboard</h1>
</header>
```

### Keep Components Under 200 Lines
If a component exceeds 200 lines:
1. Extract sub-components
2. Extract custom hooks
3. Move utilities to separate files

## Props Patterns

### Destructure Props with Defaults
```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  children 
}: ButtonProps) {
  // ...
}
```

### Spread Rest Props for Extensibility
```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
}

export function Card({ title, className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-lg', className)} {...props}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
```

### Use Children for Composition
```tsx
// ❌ Avoid: Config-heavy props
<Card 
  header={<h2>Title</h2>}
  body={<p>Content</p>}
  footer={<button>Action</button>}
/>

// ✅ Prefer: Composition
<Card>
  <CardHeader>
    <h2>Title</h2>
  </CardHeader>
  <CardBody>
    <p>Content</p>
  </CardBody>
  <CardFooter>
    <button>Action</button>
  </CardFooter>
</Card>
```

## File Organization

### Component File Structure
```
src/components/
├── common/           # Shared UI components
│   ├── StatusBadge.tsx
│   └── index.ts     # Barrel export
├── charts/          # Chart components
│   ├── TimeSeriesLineChart.tsx
│   └── index.ts
├── layout/          # Layout components
│   ├── PageHeader.tsx
│   ├── Section.tsx
│   └── index.ts
└── index.ts         # Main barrel export
```

### Barrel Exports
```typescript
// src/components/common/index.ts
export { StatusBadge } from './StatusBadge';

// src/components/index.ts
export * from './common';
export * from './charts';
export * from './layout';
```

## Performance Patterns

### Memoize Expensive Children
```tsx
const MemoizedChart = memo(function Chart({ data }: ChartProps) {
  return <ExpensiveChart data={data} />;
});
```

### Avoid Inline Objects in JSX
```tsx
// ❌ Bad: New object every render
<Chart style={{ width: 400, height: 300 }} />

// ✅ Good: Stable reference
const chartStyle = { width: 400, height: 300 };
<Chart style={chartStyle} />

// ✅ Or use useMemo if dynamic
const chartStyle = useMemo(() => ({ width, height }), [width, height]);
```

## References

- [React Documentation](https://react.dev)
- [Hooks Instructions](./03-hooks.instructions.md)
- [Styling Instructions](./08-styling.instructions.md)
