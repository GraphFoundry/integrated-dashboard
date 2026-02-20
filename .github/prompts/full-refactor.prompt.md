---
agent: agent
description: Enforce React 2025 standards through comprehensive refactoring
---

# Full Dashboard Refactor

Enforce React 2025 standards, modern TypeScript patterns, and zero-compromise code quality across the integrated-dashboard codebase. This is NOT a suggestion process - violations will be fixed, not debated.

## Non-Negotiable Standards

Before starting, understand these patterns will be **automatically rejected and fixed**:

### Banned Patterns (Zero Tolerance)
1. `any` type usage (use `unknown` with guards or proper types)
2. Class components (use function components)
3. Components defined inside other components
4. Index as key for dynamic lists
5. Inline styles (use Tailwind classes)
6. Missing hook dependency arrays
7. **useEffect for state derivation** (use `useMemo` instead)
8. **useEffect for event handling** (use event handlers)
9. Prop drilling beyond 2 levels (use composition or context)
10. Console statements in production code
11. Hardcoded API URLs
12. Inline objects/arrays in JSX props (causes re-renders)

### "You Might Not Need an Effect" Rule

**useEffect is ONLY for synchronizing with external systems**:
- ✅ Subscriptions to external services
- ✅ Browser APIs (DOM, network, timers)
- ✅ Third-party widget integration
- ❌ **NOT for state derivation** (use `useMemo`)
- ❌ **NOT for event handling** (use callbacks)
- ❌ **NOT for data transformation** (compute inline)
- ❌ **NOT for resetting state** (use key prop)

## Objectives

1. **TypeScript Strict Mode** - No `any`, explicit types everywhere
2. **React 19+ Patterns** - Function components, hooks-first, composition
3. **Zero Unnecessary Re-renders** - Proper memoization and effect usage
4. **WCAG 2.1 AA Compliance** - Non-negotiable accessibility
5. **Comprehensive Testing** - Critical paths must have tests
6. **Clean Architecture** - Composition over configuration

## Phase 1: Audit (Automatic Rejection Criteria)

Analyze the codebase for violations. Each violation found is a **blocking issue**:

### TypeScript Violations (CRITICAL)
- [ ] Files using `any` type (use `unknown` with guards)
- [ ] Missing explicit return types on functions
- [ ] Implicit `any` in function parameters
- [ ] Type assertions without validation guards
- [ ] Non-strict TypeScript configuration

### Component Architecture Violations (CRITICAL)
- [ ] Components defined inside other components (**NEVER**)
- [ ] Class components (deprecated since React 16.8)
- [ ] Missing Props interfaces with explicit types
- [ ] Components over 200 lines (extract sub-components)
- [ ] Configuration props instead of composition patterns

### Effect Misuse Violations (CRITICAL)
- [ ] **useEffect for derived state** (use `useMemo` instead)
- [ ] **useEffect for event handling** (use callbacks instead)
- [ ] **useEffect for data transformation** (compute inline)
- [ ] **useEffect to reset state** (use `key` prop instead)
- [ ] useEffect without proper dependencies
- [ ] useEffect without cleanup when needed
- [ ] Hooks called conditionally or in loops

### State Management Violations (HIGH)
- [ ] Prop drilling more than 2 levels (use composition)
- [ ] State that should be colocated
- [ ] Missing memoization for expensive computations
- [ ] **Inline objects/arrays in JSX props** (causes re-renders)
- [ ] setState calls in render phase
- [ ] Storing derived values in state

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

After audit, fix violations in this order (blocking issues first):

### 🔴 BLOCKING (Fix Immediately)
1. **useEffect for derived state/events** (violates React.dev guidance)
2. **`any` types** (TypeScript strict mode violation)
3. **Components inside components** (causes re-creation every render)
4. **Inline objects/arrays in JSX** (causes child re-renders)
5. **Class components** (deprecated pattern)
6. **Missing effect cleanup** (memory leaks)
7. **WCAG violations** (accessibility blockers)

### 🟠 HIGH PRIORITY (Fix Same Session)
1. Components over 200 lines (maintainability)
2. Prop drilling beyond 2 levels (use composition)
3. Performance bottlenecks (unnecessary re-renders)
4. Missing tests for critical paths
5. Hardcoded values that should be constants
6. Inline styles instead of Tailwind

### 🟡 MEDIUM PRIORITY (Fix Soon)
1. State colocation improvements
2. Custom hook extraction for reuse
3. Styling consistency (Tailwind utilities)
4. Test coverage gaps
5. Missing TypeScript return types

### 🟢 OPTIONAL (Nice to Have)
1. Code organization refinements
2. Enhanced documentation
3. Minor optimizations

## Phase 3: Systematic Refactoring

For each file, **enforce** these patterns (not suggestions):

### Component Refactoring Template (Mandatory Pattern)

```typescript
// 1. Imports - organized by category
import { type FC, memo, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
// ... other imports

// 2. Types - explicit interface (NEVER use 'any')
interface ComponentProps {
  // Required props first
  id: string;
  // Optional props with union types (not 'any')
  variant?: 'primary' | 'secondary';
  // NEVER pass inline objects - define outside or memoize
  config: ComponentConfig; // ✅ Defined outside
}

// 3. Constants outside component (prevents re-creation)
const VARIANT_CLASSES = {
  primary: 'bg-blue-600 text-white',
  secondary: 'bg-gray-200 text-gray-900',
} as const;

// 4. Component - at module level (NEVER inside other components)
// Use memo for pure components (props → same output)
const Component: FC<ComponentProps> = memo(function Component({
  id,
  variant = 'primary',
  config, // Already stable, no inline object
}) {
  // 5. Hooks first (always same order, never conditional)
  const [state, setState] = useState<StateType>(initialState);
  
  // 6. Derived state with useMemo (NOT useEffect)
  // ❌ WRONG: useEffect(() => { setDerived(compute(state)) }, [state])
  // ✅ RIGHT:
  const derivedValue = useMemo(() => 
    expensiveComputation(state),
    [state]
  );
  
  // 7. Event handlers with useCallback (NOT useEffect)
  // ❌ WRONG: useEffect(() => { if (shouldHandle) handle() }, [shouldHandle])
  // ✅ RIGHT:
  const handleAction = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    // Event handling logic
    setState(prev => transform(prev));
  }, [/* only external dependencies */]);
  
  // 8. Effects ONLY for external systems (NOT state derivation)
  // Valid use: synchronizing with external API
  useEffect(() => {
    const subscription = api.subscribe();
    return () => subscription.unsubscribe(); // Always cleanup
  }, []);
  
  // 9. Early returns for loading/error
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  
  // 10. Render with semantic HTML and Tailwind classes
  return (
    <section 
      className={cn(
        'rounded-lg p-4', // Base classes
        VARIANT_CLASSES[variant], // Variant classes from constant
      )}
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`} className="text-xl font-bold">
        {title}
      </h2>
      {/* NEVER use inline styles */}
      {/* NEVER pass inline objects: onClick={() => fn({ id })} */}
      {/* ✅ Use stable callbacks: onClick={handleAction} */}
    </section>
  );
});

// Display name for debugging
Component.displayName = 'Component';

export default Component;
```

### Effect Usage Decision Tree (Follow Strictly)

```typescript
// Q: Do you need to synchronize with an external system?
// (API, DOM, browser API, third-party library)

// YES → useEffect is correct
useEffect(() => {
  const controller = new AbortController();
  fetch('/api', { signal: controller.signal })
    .then(handleResponse);
  return () => controller.abort();
}, []);

// NO → Ask: What are you trying to do?

// "Update state based on props/state" → Derive inline or useMemo
// ❌ useEffect(() => setTotal(a + b), [a, b])
// ✅ const total = a + b;
// ✅ const total = useMemo(() => expensiveCalc(a, b), [a, b]);

// "Handle a user event" → Use event handler
// ❌ useEffect(() => { if (clicked) doSomething() }, [clicked])
// ✅ const handleClick = () => doSomething();

// "Transform data for rendering" → Compute during render
// ❌ useEffect(() => setFiltered(items.filter(...)), [items])
// ✅ const filtered = items.filter(...);

// "Reset state when prop changes" → Use key prop
// ❌ useEffect(() => setState(initial), [userId])
// ✅ <Component key={userId} />
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

## Validation Checklist (All Must Pass)

After each refactoring, verify **zero tolerance** for violations:

### Build & Types
- [ ] `npm run lint` passes (no warnings)
- [ ] `npm run build` succeeds
- [ ] TypeScript strict mode has zero errors
- [ ] No `any` types anywhere (search: `:\s*any`)
- [ ] All functions have explicit return types

### React Patterns
- [ ] No components defined inside other components
- [ ] No class components
- [ ] No useEffect for derived state (use `useMemo`)
- [ ] No useEffect for event handling (use callbacks)
- [ ] No inline objects/arrays in JSX props
- [ ] All effects have proper cleanup when needed
- [ ] No missing dependencies in hooks

### Runtime
- [ ] Component renders correctly
- [ ] No console errors or warnings
- [ ] No unnecessary re-renders (check React DevTools)
- [ ] Tests pass (if any exist)

### Accessibility
- [ ] WCAG 2.1 AA compliance (run axe DevTools)
- [ ] Semantic HTML used throughout
- [ ] All interactive elements keyboard accessible
- [ ] Sufficient color contrast (4.5:1 minimum)

### Code Quality
- [ ] No hardcoded URLs or magic numbers
- [ ] No console.log statements
- [ ] Proper error boundaries in place
- [ ] Components under 200 lines

## Reference Documents (Standards Hierarchy)

When refactoring, **enforce** these standards (in priority order):

### Critical (Non-Negotiable)
1. `.github/instructions/99-critical-guardrails.instructions.md` - **Blocking violations**
2. `.github/instructions/03-hooks.instructions.md` - **"You Might Not Need an Effect"**
3. `.github/instructions/01-types.instructions.md` - TypeScript strict standards
4. `.github/instructions/02-components.instructions.md` - Component architecture

### High Priority
5. `.github/instructions/04-state-management.instructions.md` - State patterns
6. `.github/instructions/08-styling.instructions.md` - Tailwind standards
7. `.github/skills/performance-optimization/SKILL.md` - Performance patterns
8. `.github/skills/accessibility-validation/SKILL.md` - WCAG 2.1 AA compliance

### Supporting
9. `.github/instructions/react-components.instructions.md` - Component best practices
10. `.github/skills/testing-patterns/SKILL.md` - Testing strategies

## Execution Strategy

**This is a single-shot refactoring process**:

1. **Audit Phase**: Scan file, identify ALL violations (not just first few)
2. **Fix Phase**: Apply fixes for ALL violations in one pass
3. **Validate Phase**: Verify all checks pass before moving to next file
4. **Report Phase**: Document changes with before/after

**Do NOT**:
- Fix violations incrementally (do all at once)
- Skip validation steps
- Leave TODO comments for future fixes
- Ask permission for each fix (standards are non-negotiable)

## Output Format

For each file refactored, provide:

```
### [filename]

**Violations Found:**
- 🔴 [Blocking] useEffect used for derived state (line X)
- 🔴 [Blocking] `any` type on parameter (line Y)
- 🟠 [High] Component over 200 lines
- 🟡 [Medium] Missing memoization

**Changes Applied:**
- Converted useEffect to useMemo for derived state
- Added explicit type for parameter: `string`
- Extracted sub-component: `ComponentDetails`
- Added React.memo wrapper for pure component

**Validation Results:**
- ✅ Lint passed (0 warnings)
- ✅ Build passed
- ✅ TypeScript strict mode (0 errors)
- ✅ No banned patterns detected
- ✅ WCAG 2.1 AA compliant
- ✅ Zero unnecessary re-renders

**Lines Changed:** 45 → 52 (extracted subcomponent)
```

## Success Criteria

Refactoring is complete when:

1. **Zero banned patterns** remain in codebase
2. **All effects** are synchronizing with external systems only
3. **TypeScript strict mode** passes with no errors
4. **WCAG 2.1 AA** compliance verified
5. **Build and tests** pass
6. **Performance**: No unnecessary re-renders detected
