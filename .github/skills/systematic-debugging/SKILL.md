---
name: Systematic Debugging
description: A structured approach to debugging React dashboard applications
---

# Systematic Debugging

A structured approach to debugging React dashboard applications.

## When to Use This Skill

- Feature not working as expected
- Component not rendering
- State not updating
- API data not appearing
- Unexpected behavior after changes

## When NOT to Use This Skill

- For known simple fixes (just fix them)
- When error messages are clear and actionable
- For TypeScript errors (fix the types, don't debug around them)

## Common React Anti-Pattern Bugs

Check these first - they cause 80% of React bugs:

1. **useEffect for derived state** - Causes extra renders, stale data
2. **Missing hook dependencies** - Causes stale closures
3. **Components inside components** - Causes state loss
4. **Index as key** - Causes wrong state association
5. **Mutating state directly** - Causes no re-render
6. **Missing cleanup** - Causes memory leaks, zombie subscriptions

## Debugging Framework

### 1. OBSERVE - What is happening?

```
□ What is the expected behavior?
□ What is the actual behavior?
□ Can you reproduce consistently?
□ When did it start happening?
□ What changed recently?
```

### 2. HYPOTHESIZE - What could cause this?

Common React issues:
- [ ] Props not passed correctly
- [ ] State not updating (wrong dependencies)
- [ ] Effect not running (stale closure)
- [ ] Race condition (async timing)
- [ ] Context not available
- [ ] Component not re-rendering
- [ ] Key prop causing remount

### 3. TEST - Verify each hypothesis

```tsx
// Add strategic console logs
console.log('Props:', props);
console.log('State:', state);
console.log('Effect running with:', dependency);

// Use React DevTools
// 1. Select component
// 2. Inspect props and state
// 3. Check hooks values
```

### 4. FIX - Apply the solution

Apply minimal fix, then verify:
```bash
npm run typecheck  # No type errors
npm run lint       # No lint errors
npm test           # Tests pass
```

## Common Bug Patterns

### Stale Closure
```tsx
// ❌ Bug: count is always 0
useEffect(() => {
  setInterval(() => {
    setCount(count + 1);  // count captured at 0
  }, 1000);
}, []);

// ✅ Fix: Use functional update
useEffect(() => {
  setInterval(() => {
    setCount(c => c + 1);
  }, 1000);
}, []);
```

### Missing Dependency
```tsx
// ❌ Bug: Doesn't refetch when userId changes
useEffect(() => {
  fetchUser(userId);
}, []);

// ✅ Fix: Add dependency
useEffect(() => {
  fetchUser(userId);
}, [userId]);
```

### Race Condition
```tsx
// ❌ Bug: Shows stale data
useEffect(() => {
  fetchData(id).then(setData);
}, [id]);

// ✅ Fix: Ignore stale responses
useEffect(() => {
  let cancelled = false;
  
  fetchData(id).then(data => {
    if (!cancelled) setData(data);
  });
  
  return () => { cancelled = true; };
}, [id]);
```

### Object Reference Equality
```tsx
// ❌ Bug: Effect runs every render
const options = { page: 1, limit: 10 };  // New object each render
useEffect(() => {
  fetch(options);
}, [options]);

// ✅ Fix: Memoize or use primitives
const options = useMemo(() => ({ page, limit }), [page, limit]);
useEffect(() => {
  fetch(options);
}, [options]);
```

### Missing Key Prop
```tsx
// ❌ Bug: Items don't update correctly
{items.map((item, index) => (
  <Item key={index} item={item} />  // Index as key
))}

// ✅ Fix: Use stable unique key
{items.map(item => (
  <Item key={item.id} item={item} />
))}
```

### Context Not Available
```tsx
// ❌ Bug: useContext returns undefined
function Component() {
  const value = useContext(MyContext);  // No provider above!
}

// ✅ Fix: Ensure provider wraps component
<MyContext.Provider value={value}>
  <Component />
</MyContext.Provider>
```

## Debugging Tools

### Console Methods
```tsx
console.log('Value:', value);
console.table(arrayOfObjects);
console.group('Group');
console.log('Nested');
console.groupEnd();
console.trace('Stack trace');
console.time('operation');
// ... operation
console.timeEnd('operation');
```

### React DevTools
1. **Components Tab**: Inspect component tree, props, state
2. **Profiler Tab**: Record and analyze renders
3. **Highlight Updates**: See what's re-rendering

### Network Tab
1. Filter by Fetch/XHR
2. Check request URL and method
3. Inspect request/response body
4. Check status codes

### VS Code Debugger
```json
// launch.json
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug React",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/src"
}
```

## Debugging Checklist

### Data Flow
- [ ] Props passed correctly from parent?
- [ ] State initialized properly?
- [ ] API response shape matches types?
- [ ] Null/undefined handled?

### Effects
- [ ] Dependencies complete?
- [ ] Cleanup function provided?
- [ ] No infinite loops?
- [ ] Async handled correctly?

### Rendering
- [ ] Conditional rendering correct?
- [ ] Keys unique and stable?
- [ ] Context provider present?
- [ ] Error boundary catching errors?

### Integration
- [ ] Event handlers connected?
- [ ] Form values controlled?
- [ ] Router params accessible?
- [ ] Environment variables set?

## Debug Report Template

```markdown
## Bug Report

### Symptom
[What is happening]

### Expected
[What should happen]

### Reproduction Steps
1. [Step 1]
2. [Step 2]

### Root Cause
[Why it's happening]

### Solution
[Code changes]

### Verification
- [ ] Bug fixed
- [ ] No regressions
- [ ] Tests updated
```

## References

- [React DevTools](https://react.dev/learn/react-developer-tools)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
