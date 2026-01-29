---
name: React Component Standards
description: 'React component development standards for dashboard UI'
applyTo: 'src/components/**/*.tsx, src/pages/**/*.tsx, src/widgets/**/*.tsx'
---

# React Component Standards

## Component Structure
1. Imports (React, libraries, local)
2. Type definitions (Props interface)
3. Component function
4. Default export

## Patterns to Follow
- Use destructured props with TypeScript interface
- Implement loading and error states
- Use semantic HTML elements
- Add `aria-` attributes for accessibility
- Prefer `useMemo` and `useCallback` for expensive operations

## Anti-Patterns to Avoid
- No `useEffect` without cleanup when subscribing
- No inline object/array creation in JSX (causes re-renders)
- No index-based keys for dynamic lists
