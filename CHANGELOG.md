# Changelog

## 2026-02-18 - UI Refactor (No Behavior Change)

### Scope
- Refactor limited to `src/**` (React UI code only).
- `bff/**` intentionally unchanged and remains out of scope.

### Cleanup
- Normalized shared token usage for page wrappers, loading cards, and common buttons.
- Removed clearly unreferenced UI/source files after import-graph verification:
  - `src/pages/pipeline/components/*` + `src/pages/pipeline/pipelineTypes.ts`
  - `src/widgets/alerts/*`
  - `src/lib/alertsApiClient.ts`, `src/lib/download.ts`, `src/lib/severity.ts`, `src/lib/time.ts`
  - `src/components/common/SeverityBadge.tsx`

### UI Consistency
- Standardized loading/empty presentation on routed pages using shared primitives (`LoadingSpinner`, `EmptyState`, `ErrorBanner`) with unchanged trigger conditions.
- Applied shared class tokens across overview/history/service/offender/simulation/scheduler/alerts surfaces.
- Kept existing per-page visual identity (mild standardization, no redesign).

### Accessibility
- Added `htmlFor` + `id` associations for alert filters and scheduler modal pod selector.
- Added dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`) for scheduler apply modal.
- Added ARIA expanded-state metadata for expandable incident event details.
- Added polite live-region attributes for alert toast notifications.

### Structure / Maintainability
- Extracted local presentational subcomponents in large pages (`Metrics`, `AlertsPlaceholder`, `IncidentDetail`, `SchedulerDecisions`, `NodeResourceGraph`) without moving business logic.
- No business logic, API behavior, routing behavior, or state transition behavior changed.

### Verification
- `npm run lint` passes with warnings only (no errors).
- `npm run build` passes.
- Existing warning profile remains behavior-sensitive and out of scope (`react-hooks/exhaustive-deps` in select pages, `no-explicit-any` in `bff/**` and select `src/lib/**` utilities).

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
