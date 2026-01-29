---
agent: agent
description: Debug and fix a feature that isn't working correctly
---

# Debug Feature

Systematically debug and fix a feature that isn't working correctly.

## Input Required

- **Symptom**: What's happening vs what should happen
- **Location**: Component/page where issue occurs
- **Reproducibility**: Steps to reproduce

## Debugging Process

### 1. Gather Information

```bash
# Check for compilation errors
npm run typecheck

# Check for lint errors
npm run lint

# Check browser console for errors
# React DevTools for component state
```

### 2. Isolate the Problem

**Check data flow:**
```
Props passed → State set → Effect runs → Render output
```

**Common issues:**
- Props not passed correctly
- State not updating
- Effect dependencies wrong
- Async timing issues

### 3. Debug Techniques

#### Console Logging (temporary)
```tsx
// Add strategic logs
console.log('Props:', props);
console.log('State:', state);
console.log('Effect running with:', dependency);
```

#### React DevTools
1. Open React DevTools
2. Select component
3. Inspect props and state
4. Check hooks values

#### Network Tab
1. Open Network tab
2. Filter by Fetch/XHR
3. Check request/response
4. Look for errors

### 4. Common Bug Patterns

#### Stale Closure
```tsx
// ❌ Bug: Uses stale value
useEffect(() => {
  const timer = setInterval(() => {
    setCount(count + 1);  // count is stale
  }, 1000);
  return () => clearInterval(timer);
}, []); // missing count dependency

// ✅ Fix: Functional update
useEffect(() => {
  const timer = setInterval(() => {
    setCount(c => c + 1);  // uses current value
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

#### Missing Dependency
```tsx
// ❌ Bug: Effect doesn't re-run
useEffect(() => {
  fetchData(userId);
}, []); // userId changes but effect doesn't

// ✅ Fix: Add dependency
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

#### Race Condition
```tsx
// ❌ Bug: Stale response overwrites fresh
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

#### Object Reference Equality
```tsx
// ❌ Bug: Effect runs every render
const options = { page: 1 };
useEffect(() => {
  fetchData(options);
}, [options]); // new object each render

// ✅ Fix: Memoize or use primitives
const options = useMemo(() => ({ page }), [page]);
useEffect(() => {
  fetchData(options);
}, [options]);
```

### 5. Testing the Fix

```bash
# Run related tests
npm test -- --related

# Type check
npm run typecheck

# Lint
npm run lint
```

## Debugging Checklist

### Data Issues
- [ ] Props passed correctly from parent
- [ ] State initialized properly
- [ ] API response matches expected shape
- [ ] Null/undefined handled

### Effect Issues
- [ ] Dependencies complete
- [ ] Cleanup function provided
- [ ] No infinite loops
- [ ] Async handled correctly

### Render Issues
- [ ] Conditional rendering correct
- [ ] Keys unique and stable
- [ ] Re-renders as expected
- [ ] No stale UI

### Integration Issues
- [ ] Event handlers connected
- [ ] Form values controlled
- [ ] Navigation works
- [ ] Context providers present

## Output Format

```markdown
## Debug Report: [Feature]

### Problem
- **Symptom**: [What was happening]
- **Expected**: [What should happen]

### Root Cause
[Explanation of why the bug occurred]

### Solution
[Code changes made]

### Verification
- [ ] Bug no longer occurs
- [ ] No regression in related features
- [ ] Tests pass
- [ ] No new warnings

### Prevention
[How to prevent similar bugs]
```
