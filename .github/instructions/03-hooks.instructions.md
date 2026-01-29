---
name: React Hooks
description: 'React hooks patterns and custom hook standards'
applyTo: 'src/**/*.tsx, src/hooks/**/*.ts'
---

# React Hooks Standards

## Core Principles

1. **Extract Custom Hooks** - Reusable logic goes in hooks
2. **Name with `use` Prefix** - Always start with `use`
3. **Single Responsibility** - One hook, one concern
4. **Complete Dependencies** - Never ignore dependency warnings

## Hook Categories

### Data Fetching Hooks
```typescript
// src/hooks/useAlerts.ts
export function useAlerts(filters?: AlertFilters) {
  const [data, setData] = useState<Alert[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    
    async function fetchAlerts() {
      try {
        setIsLoading(true);
        const response = await alertsApi.getAlerts(filters, controller.signal);
        setData(response.data);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err as Error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchAlerts();
    return () => controller.abort();
  }, [filters]);

  return { data, isLoading, error };
}
```

### UI State Hooks
```typescript
// src/hooks/useDisclosure.ts
export function useDisclosure(initialState = false) {
  const [isOpen, setIsOpen] = useState(initialState);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return { isOpen, open, close, toggle };
}
```

### Event Hooks
```typescript
// src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

## Must-Follow Rules

### Always Include All Dependencies
```typescript
// ❌ NEVER - Missing dependency
useEffect(() => {
  fetchData(userId);
}, []); // userId missing!

// ✅ Always complete
useEffect(() => {
  fetchData(userId);
}, [userId]);

// ✅ Or use ref for stable reference
const userIdRef = useRef(userId);
useEffect(() => {
  fetchData(userIdRef.current);
}, []);
```

### Always Clean Up Effects
```typescript
// ✅ Good: Cleanup for subscriptions
useEffect(() => {
  const subscription = eventBus.subscribe('alert', handler);
  return () => subscription.unsubscribe();
}, [handler]);

// ✅ Good: Cleanup for timers
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}, [tick]);

// ✅ Good: Cleanup for fetch
useEffect(() => {
  const controller = new AbortController();
  fetchData(controller.signal);
  return () => controller.abort();
}, []);
```

### Use useCallback for Callback Props
```typescript
// ❌ Bad: New function every render
<ChildComponent onClick={() => handleClick(id)} />

// ✅ Good: Stable callback
const handleItemClick = useCallback(() => {
  handleClick(id);
}, [handleClick, id]);

<ChildComponent onClick={handleItemClick} />
```

### Use useMemo for Expensive Computations
```typescript
// ❌ Bad: Recomputes every render
const sortedItems = items.sort((a, b) => a.date - b.date);

// ✅ Good: Memoized
const sortedItems = useMemo(
  () => [...items].sort((a, b) => a.date - b.date),
  [items]
);
```

## Custom Hook Patterns

### Return Object for Multiple Values
```typescript
// ✅ Good: Named properties
function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount(c => c + 1), []);
  const decrement = useCallback(() => setCount(c => c - 1), []);
  const reset = useCallback(() => setCount(initial), [initial]);
  
  return { count, increment, decrement, reset };
}

// Usage - clear what each value is
const { count, increment } = useCounter(0);
```

### Accept Options Object for Configuration
```typescript
interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  onLoadMore: () => void;
}

function useInfiniteScroll({
  threshold = 0.5,
  rootMargin = '100px',
  onLoadMore,
}: UseInfiniteScrollOptions) {
  // Implementation
}
```

### Return Loading/Error States
```typescript
interface UseAsyncResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useAsync<T>(asyncFn: () => Promise<T>): UseAsyncResult<T> {
  // Implementation
}
```

## Anti-Patterns to Avoid

### Don't Use Lifecycle Hooks
```typescript
// ❌ NEVER - Lifecycle abstraction
function useMount(fn: () => void) {
  useEffect(() => {
    fn();
  }, []); // eslint-disable-next-line
}

// ✅ Instead - Purpose-named hooks
function useChatConnection({ roomId, serverUrl }: Options) {
  useEffect(() => {
    const connection = createConnection({ roomId, serverUrl });
    connection.connect();
    return () => connection.disconnect();
  }, [roomId, serverUrl]);
}
```

### Don't Suppress Linter Warnings
```typescript
// ❌ NEVER
useEffect(() => {
  fetchData(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// ✅ Fix the actual issue
const idRef = useRef(id);
useEffect(() => {
  fetchData(idRef.current);
}, []);
```

## Hook File Organization

```
src/
├── hooks/
│   ├── useAlerts.ts       # Domain-specific
│   ├── useMetrics.ts
│   ├── useDebounce.ts     # Utility hooks
│   ├── useDisclosure.ts
│   └── index.ts           # Barrel export
└── pages/
    └── alerts/
        └── hooks/         # Page-specific hooks
            └── useAlertFilters.ts
```

## References

- [React Hooks Documentation](https://react.dev/reference/react)
- [Rules of Hooks](https://react.dev/warnings/invalid-hook-call-warning)
