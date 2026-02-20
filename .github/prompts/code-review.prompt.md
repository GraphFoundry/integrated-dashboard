---
agent: agent
description: Perform comprehensive code review
---

# Code Review

Perform a comprehensive code review against project standards.

## Input Required

- **Files to Review**: Specific files or "changed files"
- **Review Focus**: `all` | `types` | `components` | `performance` | `accessibility`

## Review Checklist

### TypeScript Standards (`.github/instructions/01-types.instructions.md`)

- [ ] No `any` type usage
- [ ] Explicit return types on exported functions
- [ ] Props interfaces defined for all components
- [ ] Proper use of `interface` vs `type`
- [ ] No type assertions without justification

### Component Standards (`.github/instructions/02-components.instructions.md`)

- [ ] Functional components only
- [ ] No components defined inside other components
- [ ] Semantic HTML elements used
- [ ] Loading/error/empty states handled
- [ ] Props destructured with defaults
- [ ] Component under 200 lines

### Hook Standards (`.github/instructions/03-hooks.instructions.md`)

- [ ] All dependencies included in arrays
- [ ] Effects have cleanup functions
- [ ] useCallback for callback props
- [ ] useMemo for expensive computations
- [ ] No suppressed linter warnings

### Styling Standards (`.github/instructions/08-styling.instructions.md`)

- [ ] Tailwind utilities used exclusively
- [ ] No inline styles
- [ ] Design tokens used (not arbitrary values)
- [ ] Mobile-first responsive design
- [ ] cn() utility for class merging

### Performance

- [ ] No inline objects/arrays in JSX
- [ ] Expensive computations memoized
- [ ] Large lists virtualized
- [ ] Images optimized
- [ ] No unnecessary re-renders

### Accessibility

- [ ] Interactive elements are buttons/links
- [ ] Form inputs have labels
- [ ] Images have alt text
- [ ] Color not sole indicator
- [ ] Keyboard navigation works

### Critical Guardrails (`.github/instructions/99-critical-guardrails.instructions.md`)

- [ ] No `any` types
- [ ] No components inside components
- [ ] No ignored hook dependencies
- [ ] No index keys for dynamic lists
- [ ] No inline styles
- [ ] No console statements
- [ ] No hardcoded URLs

## Review Output Format

```markdown
## Review Summary

**Files Reviewed**: [list]
**Issues Found**: [count] critical, [count] warnings, [count] suggestions

---

## Critical Issues 🚨

### [File:Line] Issue Title
**Category**: [TypeScript/Component/Hook/Performance/A11y]
**Rule**: [Reference to instruction]

**Current Code**:
```tsx
// problematic code
```

**Required Fix**:
```tsx
// corrected code
```

---

## Warnings ⚠️

[Similar format]

---

## Suggestions 💡

[Similar format]

---

## Passed Checks ✅

- [List of things done correctly]
```

## Commands

```bash
# Check for lint errors
npm run lint

# Check TypeScript
npm run typecheck

# Run tests
npm test
```
