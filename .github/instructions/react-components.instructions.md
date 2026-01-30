---
name: React Component Standards
description: 'React component development standards for dashboard UI'
applyTo: 'src/components/**/*.tsx, src/pages/**/*.tsx, src/widgets/**/*.tsx'
---

# React Component Standards

## Component Structure
1. Imports (React, libraries, local)
2. Type definitions (Props interface)
3. Component function (named export)
4. No default exports for components

## Mandatory Patterns

### TypeScript Props Interface
```typescript
interface CardProps {
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'outlined';
  className?: string;
}

export function Card({ title, children, variant = 'default', className }: CardProps) {
  // ...
}
```

### Loading/Error/Empty States
Every data-displaying component MUST handle:
- Loading state (skeleton or spinner)
- Error state (with retry option)
- Empty state (actionable message)

### Semantic HTML
Use appropriate elements:
- `<article>` for self-contained content
- `<section>` for thematic grouping
- `<header>`, `<footer>`, `<main>`, `<nav>` for landmarks
- `<button>` for actions, `<a>` for navigation

### Accessibility
- Add `aria-label` for icon-only buttons
- Use `aria-live` for dynamic content
- Ensure keyboard navigation works
- Never hide focus indicators

## FORBIDDEN Patterns

### Never Use Class Components
```typescript
// ❌ FORBIDDEN
class MyComponent extends React.Component { }

// ✅ REQUIRED
function MyComponent() { }
```

### Never Define Components Inside Components
```typescript
// ❌ FORBIDDEN - Destroys state
function Parent() {
  function Child() { return <div />; }  // NEVER
  return <Child />;
}
```

### Never Use useEffect for Derived State
```typescript
// ❌ FORBIDDEN
useEffect(() => {
  setFiltered(items.filter(predicate));
}, [items]);

// ✅ REQUIRED
const filtered = useMemo(() => items.filter(predicate), [items]);
```

### Never Use Index as Key for Dynamic Lists
```typescript
// ❌ FORBIDDEN
{items.map((item, i) => <Card key={i} />)}

// ✅ REQUIRED
{items.map(item => <Card key={item.id} />)}
```

### Never Create Inline Objects/Arrays in JSX
```typescript
// ❌ FORBIDDEN
<Chart config={{ width: 400 }} />

// ✅ REQUIRED
const config = useMemo(() => ({ width }), [width]);
<Chart config={config} />
```
