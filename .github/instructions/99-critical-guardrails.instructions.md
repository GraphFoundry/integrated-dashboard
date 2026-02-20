---
name: Critical Guardrails
description: 'Critical guardrails and must-never violations'
applyTo: 'src/**/*.ts, src/**/*.tsx'
---

# Critical Guardrails

## 🚨 MUST-NEVER Violations

These rules are non-negotiable. Any violation must be flagged immediately.

---

### 1. Never Use `any` Type

```typescript
// ❌ FORBIDDEN
function process(data: any) { }
const result: any = fetchData();
const items = [] as any[];

// ✅ REQUIRED
function process(data: unknown) {
  if (isValidData(data)) { /* typed now */ }
}
const result: FetchResult = await fetchData();
const items: Item[] = [];
```

**Why**: Defeats TypeScript's type safety, hides bugs, makes refactoring dangerous.

---

### 2. Never Define Components Inside Components

```typescript
// ❌ FORBIDDEN
function ParentComponent() {
  function ChildComponent() {  // NEVER
    return <div>Child</div>;
  }
  return <ChildComponent />;
}

// ✅ REQUIRED
function ChildComponent() {
  return <div>Child</div>;
}

function ParentComponent() {
  return <ChildComponent />;
}
```

**Why**: Creates new component identity each render, destroys state, causes performance issues.

---

### 3. Never Ignore Hook Dependency Warnings

```typescript
// ❌ FORBIDDEN
useEffect(() => {
  fetchData(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// ✅ REQUIRED
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

**Why**: Causes stale closures, bugs that are extremely hard to debug.

---

### 4. Never Use Index as Key for Dynamic Lists

```typescript
// ❌ FORBIDDEN (for dynamic lists)
{items.map((item, index) => (
  <ListItem key={index} item={item} />
))}

// ✅ REQUIRED
{items.map((item) => (
  <ListItem key={item.id} item={item} />
))}
```

**Why**: Causes incorrect re-renders, state bugs when list changes.

---

### 5. Never Skip Loading/Error States

```typescript
// ❌ FORBIDDEN
function DataDisplay({ data }) {
  return <div>{data.map(item => <Item item={item} />)}</div>;
}

// ✅ REQUIRED
function DataDisplay({ data, isLoading, error }) {
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!data?.length) return <EmptyState />;
  return <div>{data.map(item => <Item key={item.id} item={item} />)}</div>;
}
```

**Why**: Crashes on undefined, poor UX, unprofessional.

---

### 6. Never Use Inline Styles

```typescript
// ❌ FORBIDDEN
<div style={{ margin: '10px', padding: '20px' }}>Content</div>

// ✅ REQUIRED
<div className="m-2 p-5">Content</div>
```

**Why**: Breaks design system, creates maintenance nightmare, no responsive support.

---

### 7. Never Commit Console Statements

```typescript
// ❌ FORBIDDEN in production code
console.log('debug:', data);
console.error('something happened');

// ✅ Use proper logging
import { logger } from '@/lib/logger';
logger.debug('Processing data', { count: data.length });
```

**Why**: Performance impact, security risk, unprofessional output.

---

### 8. Never Hardcode API URLs

```typescript
// ❌ FORBIDDEN
fetch('http://localhost:3001/api/alerts');
fetch('https://production.api.com/alerts');

// ✅ REQUIRED
fetch(`${import.meta.env.VITE_API_URL}/alerts`);
```

**Why**: Breaks between environments, security risk.

---

### 9. Never Mutate Props or State Directly

```typescript
// ❌ FORBIDDEN
props.items.push(newItem);
state.value = newValue;

// ✅ REQUIRED
setItems([...items, newItem]);
setState(prev => ({ ...prev, value: newValue }));
```

**Why**: Breaks React's rendering model, causes subtle bugs.

---

### 10. Never Skip Cleanup in Effects

```typescript
// ❌ FORBIDDEN
useEffect(() => {
  const subscription = eventBus.subscribe(handler);
  const timer = setInterval(tick, 1000);
  // No cleanup!
}, []);

// ✅ REQUIRED
useEffect(() => {
  const subscription = eventBus.subscribe(handler);
  const timer = setInterval(tick, 1000);
  
  return () => {
    subscription.unsubscribe();
    clearInterval(timer);
  };
}, [handler, tick]);
```

**Why**: Memory leaks, zombie subscriptions, multiple handlers.

---

### 11. Never Use useEffect for Derived State

```typescript
// ❌ FORBIDDEN - Syncing state with useEffect
const [items, setItems] = useState([]);
const [filteredItems, setFilteredItems] = useState([]);

useEffect(() => {
  setFilteredItems(items.filter(i => i.active));
}, [items]);

// ✅ REQUIRED - Derive with useMemo
const [items, setItems] = useState([]);
const filteredItems = useMemo(
  () => items.filter(i => i.active),
  [items]
);
```

**Why**: Creates unnecessary render cycles, violates React data flow, makes code harder to reason about.

---

### 12. Never Use useEffect for Event Handling

```typescript
// ❌ FORBIDDEN - Event logic in effect
const [submitted, setSubmitted] = useState(false);

useEffect(() => {
  if (submitted) {
    sendAnalytics('form_submit');
    navigate('/success');
  }
}, [submitted]);

// ✅ REQUIRED - Event logic in handler
function handleSubmit() {
  sendAnalytics('form_submit');
  navigate('/success');
}
```

**Why**: Effects are for synchronization, not event responses. Event handlers are clearer and more direct.

---

### 13. Never Create Objects/Arrays in JSX Props

```typescript
// ❌ FORBIDDEN - New object every render
<Chart config={{ width: 400, height: 300 }} />
<List items={data.filter(d => d.active)} />

// ✅ REQUIRED - Memoize or define outside
const chartConfig = useMemo(() => ({ width, height }), [width, height]);
const activeItems = useMemo(() => data.filter(d => d.active), [data]);

<Chart config={chartConfig} />
<List items={activeItems} />
```

**Why**: Creates new references every render, breaks memoization, causes unnecessary child re-renders.

---

## ⚠️ Required Patterns

### TypeScript Strict Mode
All files must pass with strict mode enabled:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### Explicit Return Types
All functions exported from modules must have explicit return types:
```typescript
// ✅ REQUIRED
export function calculateRisk(value: number): RiskLevel {
  return value > 0.7 ? 'high' : 'low';
}
```

### Validation Commands
Before any PR or commit, verify:
```bash
npm run lint      # No errors
npm run build     # Successful build
npm run typecheck # No TypeScript errors
```

---

## Enforcement

1. **ESLint** - Catches most violations automatically
2. **TypeScript** - Strict mode catches type issues
3. **CI Pipeline** - Blocks merges with violations
4. **Code Review** - Human review for patterns
5. **This Document** - Reference for ambiguous cases

---

## Escalation

If you believe a rule should be violated for a specific case:
1. Document the reason explicitly
2. Get approval from tech lead
3. Add `// EXCEPTION: [reason]` comment
4. Create tech debt ticket for future resolution
