---
agent: agent
description: Analyze and optimize component performance
---

# Optimize Performance

Analyze and optimize React component performance.

## Input Required

- **Target**: Component or page to optimize
- **Issues**: Observed performance problems (optional)

## Performance Audit

### 1. Re-render Analysis

Check for unnecessary re-renders:

```tsx
// ❌ Problem: Inline objects cause re-renders
<Chart config={{ width: 400, height: 300 }} />

// ✅ Solution: Stable reference
const chartConfig = useMemo(() => ({ width, height }), [width, height]);
<Chart config={chartConfig} />
```

```tsx
// ❌ Problem: New function on each render
<Button onClick={() => handleClick(id)} />

// ✅ Solution: Stable callback
const handleItemClick = useCallback(() => handleClick(id), [id]);
<Button onClick={handleItemClick} />
```

### 2. Memoization Opportunities

```tsx
// ❌ Problem: Expensive computation on every render
const sortedItems = items.sort((a, b) => a.date - b.date);

// ✅ Solution: Memoize the result
const sortedItems = useMemo(
  () => [...items].sort((a, b) => a.date - b.date),
  [items]
);
```

### 3. Component Memoization

```tsx
// ❌ Problem: Child re-renders when parent does
function ExpensiveChild({ data }) {
  // Heavy rendering
}

// ✅ Solution: Memoize the component
const ExpensiveChild = memo(function ExpensiveChild({ data }) {
  // Heavy rendering
});
```

### 4. List Virtualization

```tsx
// ❌ Problem: Rendering 1000+ items
{items.map(item => <Item key={item.id} item={item} />)}

// ✅ Solution: Virtualize with react-window
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={items.length}
  itemSize={50}
>
  {({ index, style }) => (
    <Item style={style} item={items[index]} />
  )}
</FixedSizeList>
```

### 5. Code Splitting

```tsx
// ❌ Problem: Large bundle, slow initial load
import { HeavyComponent } from './HeavyComponent';

// ✅ Solution: Lazy load
const HeavyComponent = lazy(() => import('./HeavyComponent'));

<Suspense fallback={<Skeleton />}>
  <HeavyComponent />
</Suspense>
```

### 6. Effect Optimization

```tsx
// ❌ Problem: Effect runs too often
useEffect(() => {
  fetchData(filters);
}, [filters]); // filters is new object each time

// ✅ Solution: Stable dependency or deep compare
const filterString = JSON.stringify(filters);
useEffect(() => {
  fetchData(filters);
}, [filterString]);
```

## Performance Checklist

### Re-renders
- [ ] No inline objects/arrays in JSX
- [ ] Callbacks wrapped in useCallback
- [ ] Expensive children memoized with memo()
- [ ] Context split to prevent cascading updates

### Computations
- [ ] Expensive calculations in useMemo
- [ ] Derived state not stored in useState
- [ ] Filtering/sorting memoized

### Loading
- [ ] Large components lazy loaded
- [ ] Routes code-split
- [ ] Images optimized and lazy loaded
- [ ] Assets compressed

### Lists
- [ ] Virtual scrolling for 50+ items
- [ ] Stable keys (not index for dynamic lists)
- [ ] Item components memoized

### Effects
- [ ] Minimal dependencies
- [ ] Cleanup functions provided
- [ ] No redundant state syncing

## Measuring Performance

```tsx
// React DevTools Profiler
// 1. Open React DevTools
// 2. Go to Profiler tab
// 3. Click Record
// 4. Perform actions
// 5. Analyze flame graph

// Console timing
console.time('render');
// ... component logic
console.timeEnd('render');
```

## Bundle Analysis

```bash
# Analyze bundle size
npm run build -- --analyze

# Check for duplicates
npx source-map-explorer dist/assets/*.js
```

## Output Format

```markdown
## Performance Analysis: [Component]

### Issues Found

1. **[Issue]**: Description
   - Impact: High/Medium/Low
   - Fix: Code change

### Optimizations Applied

1. **[Optimization]**: What was changed
   - Before: X renders
   - After: Y renders

### Metrics

- Bundle size: Xkb → Ykb
- Render time: Xms → Yms
```
