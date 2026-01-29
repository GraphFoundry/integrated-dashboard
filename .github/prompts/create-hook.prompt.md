---
agent: agent
description: Create a custom React hook following project standards
---

# Create Hook

Create a custom React hook following project patterns and standards.

## Input Required

- **Hook Name**: Descriptive name starting with `use` (e.g., `useAlerts`, `useDebounce`)
- **Hook Type**: `data-fetching` | `state` | `utility` | `event`
- **Purpose**: What the hook does

## Hook Location

```
src/hooks/{hookName}.ts        # Shared hooks
src/pages/{page}/hooks/        # Page-specific hooks
src/widgets/{widget}/hooks/    # Widget-specific hooks
```

## Hook Templates

### Data Fetching Hook

```typescript
// src/hooks/use${DataName}.ts
import { useState, useEffect, useCallback } from 'react';
import { ${dataName}Api } from '@/lib/${dataName}ApiClient';
import type { ${DataType}, ${DataFilters} } from '@/lib/types';

interface Use${DataName}Options {
  /** Initial filters */
  filters?: ${DataFilters};
  /** Auto-fetch on mount */
  enabled?: boolean;
}

interface Use${DataName}Result {
  /** Fetched data */
  data: ${DataType}[] | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch data */
  refetch: () => Promise<void>;
}

export function use${DataName}({
  filters,
  enabled = true,
}: Use${DataName}Options = {}): Use${DataName}Result {
  const [data, setData] = useState<${DataType}[] | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ${dataName}Api.get${DataName}(filters, signal);
      setData(response.data);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    fetchData(controller.signal);

    return () => controller.abort();
  }, [fetchData, enabled]);

  const refetch = useCallback(() => fetchData(), [fetchData]);

  return { data, isLoading, error, refetch };
}
```

### State Hook

```typescript
// src/hooks/use${StateName}.ts
import { useState, useCallback, useMemo } from 'react';

interface Use${StateName}Options<T> {
  /** Initial value */
  initialValue: T;
}

export function use${StateName}<T>({
  initialValue,
}: Use${StateName}Options<T>) {
  const [value, setValue] = useState<T>(initialValue);

  const updateValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(newValue);
  }, []);

  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);

  return useMemo(() => ({
    value,
    setValue: updateValue,
    reset,
  }), [value, updateValue, reset]);
}
```

### Utility Hook

```typescript
// src/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

/**
 * Debounce a value by the specified delay
 * 
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced value
 * 
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 300);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### Event Hook

```typescript
// src/hooks/useClickOutside.ts
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Detect clicks outside of a referenced element
 * 
 * @param handler - Callback when click outside occurs
 * @returns Ref to attach to the element
 * 
 * @example
 * const ref = useClickOutside(() => setOpen(false));
 * return <div ref={ref}>...</div>;
 */
export function useClickOutside<T extends HTMLElement>(
  handler: () => void
): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler]);

  return ref;
}
```

## Best Practices

### Return Object for Multiple Values
```typescript
// ✅ Good: Named properties
return { data, isLoading, error, refetch };

// ❌ Avoid: Array return (hard to skip values)
return [data, isLoading, error, refetch];
```

### Accept Options Object
```typescript
// ✅ Good: Extensible options
function useData(options: UseDataOptions = {}) { }

// ❌ Avoid: Many positional args
function useData(id, filters, enabled, limit) { }
```

### Always Include Cleanup
```typescript
useEffect(() => {
  const subscription = subscribe(handler);
  return () => subscription.unsubscribe();  // ✅ Cleanup
}, [handler]);
```

### Memoize Return Values
```typescript
return useMemo(() => ({
  value,
  actions,
}), [value, actions]);
```

## Checklist

- [ ] Hook name starts with `use`
- [ ] TypeScript types for options and return
- [ ] JSDoc documentation with example
- [ ] Cleanup in effects
- [ ] Dependencies complete
- [ ] Return values memoized
- [ ] Tests in `__tests__/` folder
