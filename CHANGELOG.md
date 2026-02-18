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

## 2026-02-18 - BFF Mechanical Refactor (No Behavior Change)

### Scope
- Refactor limited to `bff/src/**`.
- No endpoint, request/response contract, webhook flow, WebSocket broadcast shape, SMS invocation flow, or status-code behavior changes.

### Cleanup
- Removed the blocking lint error in `bff/src/storage.ts` (unused constructor argument) with a behavior-neutral no-op consumption.
- Organized `bff/src/index.ts` bootstrap/handlers mechanically via shared helpers (env loading, internal error response path, graceful shutdown) while preserving existing route outputs.
- Improved readability/internal typing in `bff/src/service.ts` and `bff/src/storage.ts` without changing projection/filter/sorting semantics.
- Normalized formatting and internal typing in `bff/src/sms.service.ts` while preserving FitSMS/OpenAI request payloads, headers, model/prompt intent, fallback truncation paths, and `sendSms` success/error envelope behavior.

### Verification
- `cd bff && npm run lint` passes with **0 errors**.
- `cd bff && npm run build` passes.
- Remaining lint warnings are intentionally out of scope and currently limited to existing `no-explicit-any` usages in `bff/src/types.ts`.
