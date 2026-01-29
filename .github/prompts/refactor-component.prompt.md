---
agent: agent
description: Refactor a component to follow project standards
---

# Refactor Component

Refactor an existing component to follow all project standards and best practices.

## Input Required

- **Component Path**: Path to the component to refactor
- **Focus Areas**: Specific issues to address (or "all")

## Refactoring Steps

### 1. Analyze Current State

```bash
# Check for errors
npm run lint -- --fix
npm run typecheck
```

### 2. Apply Type Safety

```tsx
// Before: any types
function Component(props: any) { }

// After: proper interface
interface ComponentProps {
  value: string;
  onChange: (value: string) => void;
}

function Component({ value, onChange }: ComponentProps) { }
```

### 3. Fix Component Structure

```tsx
// Before: component inside component
function Parent() {
  function Child() { return <div />; }  // ❌
  return <Child />;
}

// After: module-level definitions
function Child() { return <div />; }  // ✅

function Parent() {
  return <Child />;
}
```

### 4. Add State Handling

```tsx
// Before: no state handling
function DataDisplay({ data }) {
  return <div>{data.map(...)}</div>;
}

// After: complete state handling
function DataDisplay({ data, isLoading, error }) {
  if (isLoading) return <Skeleton />;
  if (error) return <Error error={error} />;
  if (!data?.length) return <Empty />;
  return <div>{data.map(...)}</div>;
}
```

### 5. Fix Hook Usage

```tsx
// Before: missing dependencies
useEffect(() => {
  fetchData(id);
}, []);  // ❌

// After: complete dependencies
useEffect(() => {
  fetchData(id);
}, [id]);  // ✅
```

### 6. Apply Styling Standards

```tsx
// Before: inline styles
<div style={{ margin: '10px' }} />

// After: Tailwind utilities
<div className="m-2.5" />
```

### 7. Extract Reusable Logic

```tsx
// Before: inline logic
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => { /* fetch */ }, []);

// After: custom hook
const { data, isLoading } = useData();
```

## Refactoring Checklist

### Type Safety
- [ ] Remove all `any` types
- [ ] Add explicit return types
- [ ] Define props interface
- [ ] Use proper generics

### Component Structure
- [ ] Move nested components to module level
- [ ] Keep under 200 lines
- [ ] Use semantic HTML
- [ ] Handle all states

### Hooks
- [ ] Complete dependency arrays
- [ ] Add cleanup functions
- [ ] Use useCallback/useMemo appropriately
- [ ] Extract to custom hooks if reused

### Styling
- [ ] Replace inline styles
- [ ] Use design tokens
- [ ] Apply cn() for conditional classes
- [ ] Support className prop

### Performance
- [ ] Memoize expensive computations
- [ ] Avoid inline objects in JSX
- [ ] Use stable callback references

## Validation

```bash
# Verify no errors
npm run lint
npm run typecheck
npm run build

# Run tests
npm test -- --related
```

## Output

Provide:
1. List of changes made
2. Before/after code snippets
3. Verification that all standards are met
