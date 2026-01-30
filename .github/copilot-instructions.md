# Integrated Dashboard - Copilot Instructions

## Technology Stack
- **Frontend**: React 19+ with TypeScript (strict mode)
- **Build**: Vite with TypeScript configuration
- **Styling**: Tailwind CSS with custom design tokens
- **Backend**: Node.js BFF (Backend for Frontend) in `bff/`
- **Charts**: Recharts for data visualization

## Code Standards

### TypeScript
- Enable strict mode in all files
- Define explicit types for all function parameters and return values
- Use interfaces for object shapes, types for unions/intersections
- **NEVER use `any`** - use `unknown` with type guards, or define proper types
- Prefer `satisfies` operator for type narrowing with inference

### React Components
- Use functional components with hooks exclusively
- **NEVER use class components** - they are deprecated patterns
- Define components at module level (**NEVER inside other functions**)
- Extract custom hooks to `src/hooks/` when reused
- Name hooks with `use` prefix and purpose (e.g., `useAlerts`, `useTelemetry`)
- Keep components under 200 lines; extract sub-components when larger
- **Prefer composition over configuration** - use children/slots, not mega-props

### Effects (Critical)
- **You Might Not Need an Effect** - always ask first
- useEffect is for **synchronizing with external systems only**
- **NEVER use useEffect to derive state** - use useMemo instead
- **NEVER use useEffect to respond to events** - use event handlers
- **NEVER use useEffect to transform data for rendering** - compute inline

### File Organization
- Pages: `src/pages/{feature}/` (e.g., `src/pages/alerts/`)
- Reusable components: `src/components/{category}/`
- Utilities: `src/lib/`
- Type definitions: `src/lib/types.ts`
- API clients: `src/lib/*ApiClient.ts`

### Styling
- Use Tailwind utility classes exclusively
- Follow design tokens in `tailwind.config.ts`
- **NEVER use inline styles** - use Tailwind classes
- Create component-specific classes only when Tailwind utilities are insufficient

## Banned Patterns (Non-Negotiable)
1. `any` type usage
2. Class components
3. Components defined inside other components
4. Index as key for dynamic lists
5. Inline styles
6. Missing hook dependency arrays
7. useEffect for state derivation or event handling
8. Prop drilling beyond 2 levels (use composition or context)
9. Console statements in production code
10. Hardcoded API URLs

## Architecture

### Frontend Structure
```
src/
├── app/           # App shell, routing, layouts
├── components/    # Shared UI components
├── lib/           # Utilities, API clients, types
├── pages/         # Feature-specific pages
├── styles/        # Global CSS
└── widgets/       # Self-contained feature widgets
```

### BFF Structure
```
bff/src/
├── index.ts       # Entry point
├── service.ts     # Core service logic
├── types.ts       # Shared types
└── *.service.ts   # Domain-specific services
```

## Validation Steps
Before committing, the agent should verify:
1. `npm run lint` passes without errors
2. `npm run build` completes successfully
3. TypeScript compilation has no errors
4. New components follow existing patterns in `src/components/`

## Documentation
When implementing major features, create summary documentation in `docs/` folder.
