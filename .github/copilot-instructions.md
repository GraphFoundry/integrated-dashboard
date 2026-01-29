# Integrated Dashboard - Copilot Instructions

## Technology Stack
- **Frontend**: React 18+ with TypeScript (strict mode)
- **Build**: Vite with TypeScript configuration
- **Styling**: Tailwind CSS with custom design tokens
- **Backend**: Node.js BFF (Backend for Frontend) in `bff/`
- **Charts**: Recharts for data visualization

## Code Standards

### TypeScript
- Enable strict mode in all files
- Define explicit types for all function parameters and return values
- Use interfaces for object shapes, types for unions/intersections
- Avoid `any` - use `unknown` with type guards when necessary

### React Components
- Use functional components with hooks exclusively
- Define components at module level (never inside other functions)
- Extract custom hooks to `src/hooks/` when reused
- Name hooks with `use` prefix and purpose (e.g., `useAlerts`, `useTelemetry`)
- Keep components under 200 lines; extract sub-components when larger

### File Organization
- Pages: `src/pages/{feature}/` (e.g., `src/pages/alerts/`)
- Reusable components: `src/components/{category}/`
- Utilities: `src/lib/`
- Type definitions: `src/lib/types.ts`
- API clients: `src/lib/*ApiClient.ts`

### Styling
- Use Tailwind utility classes exclusively
- Follow design tokens in `tailwind.config.ts`
- Create component-specific classes only when Tailwind utilities are insufficient

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
