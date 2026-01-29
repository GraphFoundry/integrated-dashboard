---
agent: agent
description: Comprehensive dashboard refactoring using all project standards
---

# Full Dashboard Refactor

Perform a comprehensive refactoring of the integrated-dashboard codebase to ensure all code follows project standards, best practices, and industry conventions.

## Objectives

1. **TypeScript Compliance** - Ensure strict types everywhere
2. **Component Architecture** - Proper structure, no anti-patterns
3. **Performance** - Eliminate unnecessary re-renders
4. **Accessibility** - WCAG 2.1 AA compliance
5. **Testing** - Adequate test coverage
6. **Code Organization** - Proper file/folder structure

## Phase 1: Audit

First, analyze the codebase for violations:

### TypeScript Issues
- [ ] Files using `any` type
- [ ] Missing explicit return types
- [ ] Implicit `any` in function parameters
- [ ] Type assertions without guards

### Component Issues
- [ ] Components defined inside other components
- [ ] Missing Props interfaces
- [ ] Components over 200 lines
- [ ] Class components (if any)

### Hook Issues
- [ ] `useEffect` without proper dependencies
- [ ] `useEffect` with missing cleanup
- [ ] Logic that should be extracted to custom hooks
- [ ] Hooks called conditionally

### State Issues
- [ ] Prop drilling more than 2 levels
- [ ] State that should be colocated
- [ ] Missing memoization for expensive computations
- [ ] Inline objects/arrays in JSX causing re-renders

### Styling Issues
- [ ] Inline styles instead of Tailwind
- [ ] Inconsistent spacing/colors
- [ ] Missing dark mode support
- [ ] Non-responsive components

### Performance Issues
- [ ] Large components without memoization
- [ ] Missing React.memo on pure components
- [ ] Unnecessary re-renders
- [ ] Large bundle imports

### Accessibility Issues
- [ ] Missing alt text on images
- [ ] Non-semantic HTML
- [ ] Missing ARIA labels
- [ ] Poor color contrast
- [ ] Keyboard navigation issues

## Phase 2: Prioritized Fix List

After audit, create a prioritized list:

### 🔴 Critical (Fix First)
1. Type safety violations (`any` types)
2. Components inside components
3. Missing effect cleanup
4. Accessibility blockers

### 🟠 High Priority
1. Components over 200 lines
2. Prop drilling issues
3. Performance bottlenecks
4. Missing tests for critical paths

### 🟡 Medium Priority
1. State colocatin improvements
2. Custom hook extraction
3. Styling consistency
4. Test coverage gaps

### 🟢 Low Priority
1. Code organization
2. Documentation
3. Minor optimizations

## Phase 3: Systematic Refactoring

For each file, apply these patterns:

### Component Refactoring Template

```typescript
// 1. Imports - organized by category
import { type FC, memo, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
// ... other imports

// 2. Types - explicit interface
interface ComponentProps {
  // Required props first
  id: string;
  // Optional props with defaults
  variant?: 'primary' | 'secondary';
}

// 3. Component - at module level, memoized if pure
const Component: FC<ComponentProps> = memo(function Component({
  id,
  variant = 'primary',
}) {
  // 4. Hooks first
  const [state, setState] = useState<StateType>(initialState);
  
  // 5. Derived state with useMemo
  const derivedValue = useMemo(() => 
    expensiveComputation(state),
    [state]
  );
  
  // 6. Callbacks with useCallback
  const handleAction = useCallback((e: MouseEvent) => {
    // handler logic
  }, [/* dependencies */]);
  
  // 7. Effects with cleanup
  useEffect(() => {
    const subscription = api.subscribe();
    return () => subscription.unsubscribe();
  }, []);
  
  // 8. Early returns for loading/error
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  
  // 9. Render with semantic HTML
  return (
    <section 
      className={cn('base-classes', variantClasses[variant])}
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`}>{title}</h2>
      {/* content */}
    </section>
  );
});

export default Component;
```

## Files to Prioritize

Based on the project structure, prioritize:

### Pages (Most Impact)
1. `src/pages/overview/Overview.tsx`
2. `src/pages/metrics/Metrics.tsx` / `MetricsRefactored.tsx`
3. `src/pages/alerts/IncidentDetail.tsx`
4. `src/pages/pipeline/PipelinePlayground.tsx`
5. `src/pages/simulations/Simulations.tsx`
6. `src/pages/history/History.tsx`
7. `src/pages/decisions/SchedulerDecisions.tsx`
8. `src/pages/telemetry/TelemetryDashboard.tsx`

### Components (Reusability)
1. `src/components/charts/*.tsx`
2. `src/components/layout/*.tsx`
3. `src/components/common/*.tsx`

### Widgets (Self-Contained)
1. `src/widgets/alerts/*.tsx`

### Lib (Foundation)
1. `src/lib/types.ts`
2. `src/lib/*ApiClient.ts`
3. `src/lib/httpClient.ts`

## Validation Checklist

After each refactoring:

- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] TypeScript has no errors
- [ ] Component renders correctly
- [ ] Tests pass (if any)
- [ ] No console errors
- [ ] Accessibility audit passes

## Reference Documents

When refactoring, consult:

- `.github/instructions/01-types.instructions.md` - TypeScript standards
- `.github/instructions/02-components.instructions.md` - Component patterns
- `.github/instructions/03-hooks.instructions.md` - Hook patterns
- `.github/instructions/04-state-management.instructions.md` - State patterns
- `.github/instructions/08-styling.instructions.md` - Tailwind standards
- `.github/instructions/99-critical-guardrails.instructions.md` - Must-never violations
- `.github/skills/performance-optimization/SKILL.md` - Performance patterns
- `.github/skills/accessibility-validation/SKILL.md` - A11y patterns

## Output Format

For each file refactored, report:

```
### [filename]

**Before Issues:**
- Issue 1
- Issue 2

**Changes Made:**
- Change 1
- Change 2

**Validation:**
- ✅ Lint passed
- ✅ Build passed
- ✅ Types clean
```
