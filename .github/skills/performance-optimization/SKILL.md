---
name: Performance Optimization
description: Advanced performance optimization techniques for React dashboard applications
---

# Performance Optimization

Advanced performance optimization techniques for React dashboard applications.

## When to Use This Skill

- Diagnosing slow renders
- Optimizing large data sets
- Reducing bundle size
- Improving initial load time
- Fixing memory leaks

## Render Optimization

### 1. Identify Re-render Causes

```tsx
// Use React DevTools Profiler
// 1. Open React DevTools → Profiler tab
// 2. Click Record
// 3. Perform actions
// 4. Analyze flame graph

// Add why-did-you-render for development
if (process.env.NODE_ENV === 'development') {
  const whyDidYouRender = require('@welldone-software/why-did-you-render');
  whyDidYouRender(React, { trackAllPureComponents: true });
}
```

### 2. Prevent Unnecessary Re-renders

#### Memoize Components
```tsx
// ❌ Re-renders when parent re-renders
function ExpensiveList({ items }: ListProps) {
  return <>{items.map(item => <ExpensiveItem key={item.id} item={item} />)}</>;
}

// ✅ Only re-renders when props change
const ExpensiveList = memo(function ExpensiveList({ items }: ListProps) {
  return <>{items.map(item => <ExpensiveItem key={item.id} item={item} />)}</>;
});
```

#### Stable Callbacks
```tsx
// ❌ New function every render
<Button onClick={() => handleClick(id)}>Click</Button>

// ✅ Stable callback reference
const handleItemClick = useCallback(() => handleClick(id), [handleClick, id]);
<Button onClick={handleItemClick}>Click</Button>
```

#### Stable Objects
```tsx
// ❌ New object every render
<Chart config={{ width: 400, height: 300 }} />

// ✅ Stable reference
const chartConfig = useMemo(() => ({ width, height }), [width, height]);
<Chart config={chartConfig} />
```

### 3. Optimize Context

```tsx
// ❌ All consumers re-render on any change
const AppContext = createContext({ user, theme, settings, data });

// ✅ Split contexts by update frequency
const UserContext = createContext(user);
const ThemeContext = createContext(theme);
const SettingsContext = createContext(settings);

// ✅ Memoize context value
const value = useMemo(() => ({ user, login, logout }), [user]);
<UserContext.Provider value={value}>
```

## Data Handling

### 1. Virtualize Large Lists

```tsx
import { FixedSizeList } from 'react-window';

function VirtualizedList({ items }: { items: Item[] }) {
  return (
    <FixedSizeList
      height={500}
      width="100%"
      itemCount={items.length}
      itemSize={50}
    >
      {({ index, style }) => (
        <div style={style}>
          <ListItem item={items[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### 2. Debounce Expensive Operations

```tsx
function SearchInput({ onSearch }: { onSearch: (term: string) => void }) {
  const [value, setValue] = useState('');
  const debouncedValue = useDebounce(value, 300);
  
  useEffect(() => {
    if (debouncedValue) {
      onSearch(debouncedValue);
    }
  }, [debouncedValue, onSearch]);
  
  return <input value={value} onChange={e => setValue(e.target.value)} />;
}
```

### 3. Memoize Derived Data

```tsx
// ❌ Filters on every render
const filtered = items.filter(item => item.status === filter);
const sorted = filtered.sort((a, b) => a.date - b.date);

// ✅ Memoize expensive operations
const processedItems = useMemo(() => {
  const filtered = items.filter(item => item.status === filter);
  return filtered.sort((a, b) => a.date - b.date);
}, [items, filter]);
```

## Bundle Optimization

### 1. Code Splitting

```tsx
// Route-level splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### 2. Dynamic Imports

```tsx
// Load heavy libraries on demand
const loadChartLibrary = () => import('recharts');

function Chart({ data }: ChartProps) {
  const [Chart, setChart] = useState<typeof import('recharts') | null>(null);
  
  useEffect(() => {
    loadChartLibrary().then(setChart);
  }, []);
  
  if (!Chart) return <Skeleton />;
  
  return <Chart.LineChart data={data} />;
}
```

### 3. Tree Shaking

```tsx
// ❌ Imports entire library
import _ from 'lodash';
_.debounce(fn, 300);

// ✅ Import only what you need
import debounce from 'lodash/debounce';
debounce(fn, 300);
```

## Profiling Commands

```bash
# Analyze bundle size
npm run build -- --analyze

# Source map explorer
npx source-map-explorer dist/assets/*.js

# Performance profiling
npm run dev -- --profile
```

## Performance Checklist

### Initial Load
- [ ] Routes code-split
- [ ] Heavy components lazy-loaded
- [ ] Images optimized (WebP, lazy loading)
- [ ] CSS critical path optimized

### Runtime
- [ ] Lists virtualized (50+ items)
- [ ] Expensive computations memoized
- [ ] Context split by update frequency
- [ ] No inline objects/functions in JSX

### Network
- [ ] API responses cached
- [ ] Requests debounced/throttled
- [ ] Pagination for large datasets
- [ ] WebSocket for real-time data

### Memory
- [ ] Effects have cleanup
- [ ] Event listeners removed
- [ ] Subscriptions unsubscribed
- [ ] No circular references

## References

- [React Performance Documentation](https://react.dev/learn/render-and-commit)
- [Vite Build Optimization](https://vitejs.dev/guide/features.html#build-optimizations)
