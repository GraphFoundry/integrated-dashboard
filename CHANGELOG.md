# Changelog

## 2026-02-18 - UI Refactor (No Behavior Change)

### Scope
- Refactor limited to `src/**` (React UI code only).
- `bff/**` intentionally unchanged and remains out of scope.

### Cleanup
- Removed pre-existing `src` compile/lint blockers that were behavior-neutral.
- Removed unused variables/catch bindings touched by this refactor.

### UI Consistency
- Normalized shared primitives (`PageHeader`, `Section`, `EmptyState`, `KPIStatCard`, `LoadingSpinner`, `ErrorBanner`, `StatusBadge`).
- Standardized loading/error presentation across major routed pages with existing trigger conditions unchanged.
- Added centralized UI class tokens for repeated control styles and applied them in high-duplication form/filter areas.

### Accessibility
- Added explicit `type="button"` to non-submit buttons.
- Added `aria-label` to icon-only controls where needed.
- Added ARIA labels for previously unlabeled alert filter controls.
- Replaced `outline-none` usage with visible focus styles.

### Structure / Maintainability
- Extracted local presentational subcomponents in large pages (`Metrics`, `Simulations`, `SchedulerDecisions`, `IncidentDetail`, `IncidentExplorer`, `NodeResourceGraph`) without moving business logic.

### Verification
- `npx eslint src --quiet` passes after each refactor step.
- `npm run build` passes after each refactor step.
- Global `npm run lint` may still report existing `bff/**` issues (out of scope for this UI-only refactor).
