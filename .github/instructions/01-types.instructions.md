---
name: TypeScript Standards
description: 'TypeScript type definitions and interface standards'
applyTo: 'src/**/*.ts, src/**/*.tsx, src/lib/types.ts'
---

# TypeScript Standards

## Core Principles

1. **Strict Mode Always** - Never disable strict TypeScript checks
2. **Explicit Over Implicit** - Always define return types and parameter types
3. **Interfaces for Objects** - Use `interface` for object shapes
4. **Types for Unions** - Use `type` for unions, intersections, and mapped types

## Type Definition Patterns

### Component Props
```typescript
// ✅ Good: Interface for props with explicit types
interface DataCardProps {
  title: string;
  value: number;
  trend?: 'up' | 'down' | 'stable';
  onClick?: () => void;
}

// ❌ Bad: Inline types or any
function DataCard(props: any) { }
```

### API Response Types
```typescript
// ✅ Good: Separate request and response types
interface AlertsResponse {
  data: Alert[];
  pagination: PaginationMeta;
}

interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string; // ISO 8601
}

type AlertSeverity = 'critical' | 'warning' | 'info';
```

### Event Handler Types
```typescript
// ✅ Good: Explicit event types
type ClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => void;
type ChangeHandler = (value: string) => void;

// In component
interface FormProps {
  onSubmit: (data: FormData) => void;
  onChange: ChangeHandler;
}
```

## Must-Follow Rules

### Never Use `any`
```typescript
// ❌ NEVER
function process(data: any) { }
const result: any = fetchData();

// ✅ Instead, use unknown with type guards
function process(data: unknown) {
  if (isValidData(data)) {
    // data is now typed
  }
}

// ✅ Or define the actual type
function process(data: ProcessableData) { }
```

### Always Define Return Types
```typescript
// ❌ Bad: Implicit return type
function calculateRisk(value: number) {
  return value > 0.7 ? 'high' : 'low';
}

// ✅ Good: Explicit return type
function calculateRisk(value: number): RiskLevel {
  return value > 0.7 ? 'high' : 'low';
}
```

### Use Discriminated Unions for State
```typescript
// ✅ Good: Discriminated union for async state
type AsyncState<T> = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function useAsyncData<T>(): AsyncState<T> { }
```

### Prefer `interface` Extending Over Intersection
```typescript
// ✅ Good: Interface extension
interface BaseProps {
  className?: string;
}

interface ButtonProps extends BaseProps {
  variant: 'primary' | 'secondary';
}

// ⚠️ Acceptable for complex types
type ExtendedProps = BaseProps & {
  extraProp: string;
};
```

## Type File Organization

### Central Type File (`src/lib/types.ts`)
- Domain models (Alert, Metric, Service, etc.)
- API response/request types
- Shared utility types

### Component-Local Types
- Props interfaces defined in component file
- Internal state types

### Barrel Exports
```typescript
// src/lib/types.ts
export interface Alert { }
export interface Metric { }
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// Usage
import type { Alert, RiskLevel } from '@/lib/types';
```

## Utility Types to Use

```typescript
// Partial - All properties optional
type UpdatePayload = Partial<Alert>;

// Pick - Select specific properties
type AlertSummary = Pick<Alert, 'id' | 'severity' | 'message'>;

// Omit - Exclude properties
type AlertInput = Omit<Alert, 'id' | 'createdAt'>;

// Record - Object with known keys
type StatusMap = Record<string, AlertSeverity>;

// Extract / Exclude - For union manipulation
type CriticalSeverity = Extract<AlertSeverity, 'critical' | 'warning'>;
```

## Generics Best Practices

```typescript
// ✅ Good: Constrained generics
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// ✅ Good: Default generic parameter
interface ListProps<T = unknown> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}
```

## References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
