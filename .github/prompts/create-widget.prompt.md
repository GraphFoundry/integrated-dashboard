---
agent: agent
description: Create a self-contained widget component
---

# Create Widget

Create a new self-contained widget that manages its own data and state.

## Input Required

- **Widget Name**: The widget name (e.g., `Alerts`, `Metrics`, `ServiceHealth`)
- **Data Source**: What data the widget displays
- **Interactions**: User interactions supported

## Widget vs Component

| Widgets | Components |
|---------|------------|
| Manage own data | Receive props |
| Self-contained feature | Single purpose |
| Go in `src/widgets/` | Go in `src/components/` |

## Directory Structure

```
src/widgets/{widgetName}/
├── {WidgetName}Widget.tsx  # Main widget
├── components/              # Internal components (not exported)
│   └── {ComponentName}.tsx
├── hooks/                   # Widget-specific hooks
│   └── use{DataName}.ts
├── types.ts                 # Widget types
└── index.ts                 # Public exports only
```

## Widget Template

```tsx
// src/widgets/{widgetName}/{WidgetName}Widget.tsx
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/layout/EmptyState';
import { use${DataName} } from './hooks/use${DataName}';
import { ${WidgetName}List } from './components/${WidgetName}List';
import type { ${WidgetName}WidgetProps } from './types';

export function ${WidgetName}Widget({
  limit = 5,
  onItemClick,
  className,
}: ${WidgetName}WidgetProps) {
  const { data, isLoading, error, refetch } = use${DataName}({ limit });

  if (isLoading) {
    return <${WidgetName}Skeleton />;
  }

  if (error) {
    return (
      <WidgetError
        title="Failed to load"
        onRetry={refetch}
      />
    );
  }

  if (!data?.length) {
    return (
      <EmptyState
        title="No data"
        description="Nothing to display"
      />
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <${WidgetName}List 
        items={data} 
        onItemClick={onItemClick} 
      />
    </div>
  );
}
```

## Types Template

```tsx
// src/widgets/{widgetName}/types.ts
export interface ${WidgetName}WidgetProps {
  /** Maximum items to display */
  limit?: number;
  /** Callback when item is clicked */
  onItemClick?: (id: string) => void;
  /** Additional CSS classes */
  className?: string;
}

// Internal types (not exported from index.ts)
export interface ${WidgetName}ItemProps {
  item: ${ItemType};
  onClick?: () => void;
}
```

## Index Template

```tsx
// src/widgets/{widgetName}/index.ts
// Only export public API
export { ${WidgetName}Widget } from './${WidgetName}Widget';
export type { ${WidgetName}WidgetProps } from './types';

// DO NOT export internal components
```

## Checklist

- [ ] Widget directory created
- [ ] Main widget component with data fetching
- [ ] Internal components in `components/` folder
- [ ] Custom hook for data fetching
- [ ] Types defined in `types.ts`
- [ ] Barrel export in `index.ts` (public API only)
- [ ] Loading/error/empty states handled
- [ ] className prop supported
- [ ] JSDoc documentation for props
