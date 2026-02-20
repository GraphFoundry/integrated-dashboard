---
agent: agent
description: Enforce React 2025/2026 folder structure standards with Feature-Sliced Design and Bulletproof React patterns
---

# Organize Project Structure

Enforce industry-standard folder structure for React + TypeScript + Vite projects based on **Feature-Sliced Design (FSD)** and **Bulletproof React** best practices (2025/2026). This combines feature-based organization with scalable architecture patterns used in production at scale.

## Architecture Philosophy

### Key Principles (2025/2026 Industry Standards)

1. **Feature-First Organization** - Code organized by business domain, not technical type
2. **Unidirectional Dependencies** - Higher layers can only import from lower layers
3. **Public API Rule** - Each module exposes only its public interface via index.ts
4. **Co-location** - Related code lives together (tests, types, utils with features)
5. **Explicit Module Boundaries** - ESLint enforces import restrictions
6. **No Barrel File Abuse** - Import directly to enable Vite tree-shaking (75% faster builds)
7. **Composition at Application Level** - Features compose in pages, never cross-import

### Architecture Decision Matrix

| Pattern | When to Use | Avoid When |
|---------|-------------|------------|
| Feature-Sliced Design | Large teams, complex domains | Simple apps < 10 components |
| Bulletproof React | Mid-to-large apps, scaling teams | Micro-frontends needed |
| Layer-based (MVC) | Small apps, prototypes | Features spread across layers |
| Domain-Driven | Complex business logic | Simple CRUD apps |

## Standard Folder Structure (Hybrid FSD + Bulletproof)

```
integrated-dashboard/
├── src/
│   ├── main.tsx                    # Application entry point
│   ├── vite-env.d.ts               # Vite type definitions
│   │
│   │   # ═══════════════════════════════════════════════════════════
│   │   # LAYER: APP (Application Shell)
│   │   # Purpose: Global providers, routing, initialization
│   │   # Rule: No direct segments, orchestration only
│   │   # ═══════════════════════════════════════════════════════════
│   ├── app/
│   │   ├── App.tsx                 # Root component (providers wrapper)
│   │   ├── provider.tsx            # Combined global providers
│   │   ├── router.tsx              # Application router configuration
│   │   ├── routes.tsx              # Route definitions (lazy loaded)
│   │   └── layout/                 # App-level layouts
│   │       ├── DashboardLayout.tsx
│   │       ├── Sidebar.tsx
│   │       └── Topbar.tsx
│   │
│   │   # ═══════════════════════════════════════════════════════════
│   │   # LAYER: PAGES (Route-level Compositions)
│   │   # Purpose: Full pages that compose widgets/features
│   │   # Rule: One folder per route, composes lower layers
│   │   # ═══════════════════════════════════════════════════════════
│   ├── pages/
│   │   ├── overview/               # Route: /overview
│   │   │   ├── index.ts            # Public API (export page + lazy loader)
│   │   │   ├── ui/                 # Page-specific UI components
│   │   │   │   ├── Overview.tsx    # Main page component
│   │   │   │   ├── TopRisksNetwork.tsx
│   │   │   │   └── RiskBreakdownPie.tsx
│   │   │   ├── model/              # Page-specific state/logic
│   │   │   │   └── graphHelpers.ts
│   │   │   └── api/                # Page-specific API calls (if any)
│   │   ├── alerts/                 # Route: /alerts
│   │   ├── metrics/                # Route: /metrics
│   │   └── decisions/              # Route: /decisions
│   │
│   │   # ═══════════════════════════════════════════════════════════
│   │   # LAYER: WIDGETS (Self-Contained UI Blocks)
│   │   # Purpose: Complex, reusable UI compositions with own state
│   │   # Rule: Compose features + entities, NO business logic
│   │   # ═══════════════════════════════════════════════════════════
│   ├── widgets/
│   │   ├── alerts/                 # Self-contained alerts widget
│   │   │   ├── index.ts            # Public API
│   │   │   ├── ui/
│   │   │   │   └── AlertsSlot.tsx
│   │   │   ├── model/
│   │   │   │   └── useAlerts.tsx
│   │   │   └── types.ts            # Widget-specific types
│   │   ├── telemetry-dashboard/    # Telemetry visualization widget
│   │   └── incident-explorer/      # Incident exploration widget
│   │
│   │   # ═══════════════════════════════════════════════════════════
│   │   # LAYER: FEATURES (User Actions & Business Workflows)
│   │   # Purpose: Specific user interactions that deliver value
│   │   # Rule: Contains business logic, can use entities
│   │   # ═══════════════════════════════════════════════════════════
│   ├── features/
│   │   ├── acknowledge-alert/      # Feature: Acknowledge an alert
│   │   │   ├── index.ts            # Public API
│   │   │   ├── ui/                 # Feature UI components
│   │   │   │   └── AcknowledgeButton.tsx
│   │   │   ├── model/              # Feature state/hooks
│   │   │   │   └── useAcknowledge.ts
│   │   │   ├── api/                # Feature API calls
│   │   │   │   └── acknowledgeApi.ts
│   │   │   └── types.ts
│   │   ├── filter-incidents/       # Feature: Filter incidents
│   │   ├── export-metrics/         # Feature: Export metrics data
│   │   └── simulate-scenario/      # Feature: Run simulation
│   │
│   │   # ═══════════════════════════════════════════════════════════
│   │   # LAYER: ENTITIES (Business Domain Objects)
│   │   # Purpose: Core business data models and entity-specific UI
│   │   # Rule: NO feature dependencies, can only use shared
│   │   # ═══════════════════════════════════════════════════════════
│   ├── entities/
│   │   ├── alert/                  # Alert entity
│   │   │   ├── index.ts            # Public API
│   │   │   ├── ui/                 # Entity display components
│   │   │   │   ├── AlertCard.tsx
│   │   │   │   └── AlertBadge.tsx
│   │   │   ├── model/              # Entity schemas, stores
│   │   │   │   ├── alert.types.ts
│   │   │   │   └── alertStore.ts
│   │   │   └── api/                # Entity CRUD operations
│   │   │       └── alertApi.ts
│   │   ├── incident/               # Incident entity
│   │   ├── node/                   # Cluster node entity
│   │   ├── metric/                 # Metric entity
│   │   └── decision/               # Scheduler decision entity
│   │
│   │   # ═══════════════════════════════════════════════════════════
│   │   # LAYER: SHARED (Domain-Agnostic Reusables)
│   │   # Purpose: Reusable code with NO business knowledge
│   │   # Rule: Cannot import from any layer above
│   │   # ═══════════════════════════════════════════════════════════
│   ├── shared/
│   │   ├── ui/                     # Generic UI components (design system)
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   ├── Section.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── charts/             # Generic chart components
│   │   │       ├── TimeSeriesLineChart.tsx
│   │   │       └── LatencyMultiLineChart.tsx
│   │   ├── api/                    # API infrastructure
│   │   │   ├── httpClient.ts       # Base HTTP client
│   │   │   ├── apiTypes.ts         # Generic API types
│   │   │   └── queryClient.ts      # React Query config
│   │   ├── lib/                    # Pure utility functions
│   │   │   ├── format.ts           # Formatting utilities
│   │   │   ├── date.ts             # Date utilities
│   │   │   ├── risk.ts             # Risk calculation (if domain-agnostic)
│   │   │   └── cn.ts               # className utility
│   │   ├── config/                 # Application configuration
│   │   │   ├── env.ts              # Environment variables
│   │   │   └── constants.ts        # App-wide constants
│   │   ├── hooks/                  # Generic React hooks
│   │   │   ├── useDebounce.ts
│   │   │   ├── useLocalStorage.ts
│   │   │   └── useMediaQuery.ts
│   │   └── types/                  # Shared TypeScript types
│   │       ├── index.ts            # Re-exports all types
│   │       └── common.ts           # Common utility types
│   │
│   ├── styles/                     # Global styles
│   │   └── index.css               # Tailwind imports + globals
│   │
│   └── testing/                    # Test utilities and mocks
│       ├── setup.ts                # Test setup configuration
│       ├── mocks/                  # Mock data and handlers
│       │   ├── handlers.ts         # MSW handlers
│       │   └── fixtures/           # Test fixtures
│       └── utils/                  # Test utility functions
│           └── render.tsx          # Custom render with providers
│
├── bff/                            # Backend for Frontend
│   ├── src/
│   │   ├── index.ts                # BFF entry point
│   │   ├── service.ts              # Core service
│   │   ├── types.ts                # BFF types
│   │   ├── storage.ts
│   │   └── *.service.ts            # Domain services
│   ├── package.json
│   └── tsconfig.json
│
├── public/                         # Static assets (served as-is)
│   └── *.svg, *.png, favicon.ico
│
├── .github/                        # GitHub configuration
│   ├── copilot-instructions.md
│   ├── agents/
│   ├── instructions/
│   ├── prompts/
│   └── skills/
│
├── index.html                      # HTML entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── eslint.config.js
```

## Layer Dependency Rules (Critical for Scalability)

The FSD architecture enforces **strict unidirectional dependencies**:

```
┌─────────────────────────────────────────────────────────────┐
│  APP (top)         Can import from: all layers below        │
├─────────────────────────────────────────────────────────────┤
│  PAGES             Can import from: widgets, features,      │
│                                     entities, shared        │
├─────────────────────────────────────────────────────────────┤
│  WIDGETS           Can import from: features, entities,     │
│                                     shared                  │
├─────────────────────────────────────────────────────────────┤
│  FEATURES          Can import from: entities, shared        │
├─────────────────────────────────────────────────────────────┤
│  ENTITIES          Can import from: shared only             │
├─────────────────────────────────────────────────────────────┤
│  SHARED (bottom)   Can import from: nothing (leaf layer)    │
└─────────────────────────────────────────────────────────────┘
```

### ESLint Enforcement (2025 Best Practice)

```javascript
// eslint.config.js - Enforce layer boundaries
'import/no-restricted-paths': [
  'error',
  {
    zones: [
      // Prevent cross-feature imports
      { target: './src/features/alerts', from: './src/features', except: ['./alerts'] },
      { target: './src/features/metrics', from: './src/features', except: ['./metrics'] },
      
      // Enforce unidirectional flow
      { target: './src/features', from: './src/app' },
      { target: './src/features', from: './src/pages' },
      { target: './src/entities', from: './src/features' },
      { target: './src/entities', from: './src/widgets' },
      { target: './src/shared', from: ['./src/entities', './src/features', './src/widgets', './src/pages', './src/app'] },
    ],
  },
],
```

## Segment Conventions (Within Slices)

Each slice (feature, entity, widget, page) uses standardized segments:

| Segment | Purpose | Contains |
|---------|---------|----------|
| `ui/` | Visual components | React components, styles |
| `model/` | Business logic | Stores, hooks, schemas, calculations |
| `api/` | Data access | API calls, mappers, types |
| `lib/` | Slice utilities | Helper functions specific to slice |
| `config/` | Configuration | Feature flags, constants |
| `types.ts` | Types | TypeScript interfaces (alternative to model/) |
| `index.ts` | Public API | **ONLY exports allowed for external use** |

### Public API Rule (Critical)

```typescript
// ✅ CORRECT: Import from public API
import { AlertCard, useAlerts } from '@/entities/alert';

// ❌ WRONG: Direct import bypasses encapsulation
import { AlertCard } from '@/entities/alert/ui/AlertCard';
```

### Index.ts Pattern (2025 Recommendation)

**Important**: Avoid deep barrel files that re-export everything. They hurt Vite tree-shaking.

```typescript
// entities/alert/index.ts - Selective exports only
export { AlertCard } from './ui/AlertCard';
export { AlertBadge } from './ui/AlertBadge';
export { useAlerts } from './model/useAlerts';
export type { Alert, AlertSeverity } from './model/alert.types';
// Internal helpers NOT exported (encapsulated)
```

## Layer Purpose Rules (FSD + Bulletproof Hybrid)

### `src/app/` - Application Layer
- **Purpose**: App initialization, global providers, routing configuration
- **Contains**: App.tsx, provider.tsx, router.tsx, routes.tsx, layouts
- **Does NOT contain**: Business logic, feature code, domain entities
- **Special**: No slices, direct segment access

### `src/pages/` - Pages Layer
- **Purpose**: Route-level compositions that assemble widgets and features
- **Structure**: One slice (folder) per route with ui/, model/, api/ segments
- **Rule**: Composes from widgets, features, entities. NO cross-page imports
- **Entry**: Each page has `index.ts` with lazy-loaded default export

### `src/widgets/` - Widgets Layer
- **Purpose**: Complex, self-contained UI blocks with own state
- **Structure**: Slice with ui/, model/ segments and public index.ts
- **Rule**: Composes features + entities. NO business logic implementation
- **Example**: Dashboard panels, data tables with filters, notification centers

### `src/features/` - Features Layer  
- **Purpose**: User interactions that deliver business value
- **Structure**: Slice per user action (verb-noun naming)
- **Rule**: Contains business logic, uses entities. NO cross-feature imports
- **Examples**: `acknowledge-alert/`, `export-metrics/`, `filter-incidents/`

### `src/entities/` - Entities Layer
- **Purpose**: Core business domain objects and their representations
- **Structure**: Slice per domain concept with ui/, model/, api/ segments
- **Rule**: Can ONLY import from shared. No feature/widget dependencies
- **Examples**: `alert/`, `incident/`, `node/`, `metric/`, `decision/`

### `src/shared/` - Shared Layer
- **Purpose**: Domain-agnostic reusable code (design system, utilities, API infra)
- **Structure**: No slices, organized by segment (ui/, api/, lib/, hooks/, config/)
- **Rule**: Cannot import from ANY layer above. Zero business knowledge
- **Contains**: Generic components, httpClient, formatters, hooks like useDebounce

### `src/testing/` - Test Infrastructure
- **Purpose**: Test setup, mocks, fixtures, custom render functions
- **Structure**: setup.ts, mocks/, utils/
- **Rule**: Co-locate unit tests with source files, integration tests here

## Structural Violations (2025/2026 Standards)

### 🔴 CRITICAL Violations (Block Deployment)

1. **Layer Boundary Violations**
   - Feature importing from another feature → Compose at page level
   - Entity importing from feature → Refactor to shared or invert dependency
   - Shared importing from any layer → Move code to appropriate layer

2. **Missing Public API**
   - Slice without `index.ts` → Add public API exports
   - Direct imports bypassing index.ts → Update to use public API

3. **Cross-Feature Coupling**
   - Feature A importing from Feature B → Extract to entity or compose in widget
   - Shared code with business logic → Split domain logic to entities

4. **Wrong Layer Placement**
   - Business logic in shared → Move to entities or features
   - Entity-specific UI in shared/ui → Move to entities/{name}/ui
   - Page-specific component in widgets → Keep in pages/{name}/ui

### 🟠 HIGH Priority Violations

1. **Barrel File Abuse (Vite Performance)**
   - Deep barrel files re-exporting everything → Direct imports for internal use
   - Circular dependency from barrel files → Flatten or remove barrels

2. **Segment Misuse**
   - Hooks in `ui/` segment → Move to `model/`
   - API calls in `model/` → Move to `api/`
   - Types scattered across segments → Consolidate in `types.ts` or `model/`

3. **Naming Inconsistencies**
   - Slice folder doesn't match domain concept
   - Feature not named as verb-noun (action)
   - Component file doesn't match export name

4. **Missing Co-location**
   - Tests in separate `__tests__` tree → Co-locate with source
   - Types in global file but feature-specific → Move to feature/types.ts

### 🟡 MEDIUM Priority

1. **Deep Nesting (>3 levels)**
   - `pages/feature/components/sub/deep/` → Flatten or extract to widgets

2. **Oversized Slices**
   - Feature with 20+ files → Split into multiple features
   - Entity with complex UI → Extract widget compositions

3. **Unused Exports in Public API**
   - Dead code in index.ts → Remove unused exports

## Migration Process (Incremental Adoption)

The FSD methodology recommends incremental adoption. Don't refactor everything at once.

### Phase 1: Foundation (Start Here)

1. **Create Shared Layer**
   ```bash
   mkdir -p src/shared/{ui,api,lib,hooks,config,types}
   ```
   
2. **Move Domain-Agnostic Code**
   - `src/lib/format.ts` → `src/shared/lib/format.ts`
   - `src/lib/httpClient.ts` → `src/shared/api/httpClient.ts`
   - `src/hooks/useDebounce.ts` → `src/shared/hooks/useDebounce.ts`
   - `src/components/common/*` → `src/shared/ui/*`

3. **Configure Path Aliases**
   ```typescript
   // vite.config.ts
   resolve: {
     alias: {
       '@': path.resolve(__dirname, './src'),
       '@shared': path.resolve(__dirname, './src/shared'),
       '@entities': path.resolve(__dirname, './src/entities'),
       '@features': path.resolve(__dirname, './src/features'),
       '@widgets': path.resolve(__dirname, './src/widgets'),
       '@pages': path.resolve(__dirname, './src/pages'),
       '@app': path.resolve(__dirname, './src/app'),
     }
   }
   ```

### Phase 2: Extract Entities

1. **Identify Core Domain Objects**
   - Alert, Incident, Node, Metric, Decision

2. **Create Entity Structure**
   ```bash
   mkdir -p src/entities/alert/{ui,model,api}
   touch src/entities/alert/index.ts
   ```

3. **Move Entity-Related Code**
   - Types → `entities/{name}/model/types.ts`
   - Display components → `entities/{name}/ui/`
   - CRUD API calls → `entities/{name}/api/`

### Phase 3: Extract Features

1. **Identify User Actions**
   - What can users DO? (verbs: acknowledge, filter, export, simulate)

2. **Create Feature Structure**
   ```bash
   mkdir -p src/features/acknowledge-alert/{ui,model,api}
   touch src/features/acknowledge-alert/index.ts
   ```

3. **Move Feature-Specific Logic**
   - Action handlers, business rules, feature state

### Phase 4: Refactor Pages & Widgets

1. **Add Segment Structure to Existing Pages**
   ```bash
   mkdir -p src/pages/overview/{ui,model}
   mv src/pages/overview/Overview.tsx src/pages/overview/ui/
   ```

2. **Extract Widgets from Pages**
   - Complex, reusable UI blocks → widgets layer
   - Page-specific compositions → stay in pages

### Phase 5: Enforce Boundaries

1. **Add ESLint Rules**
2. **Add Import Linting (steiger)**
3. **CI/CD Checks**

## Execution Commands

```bash
# Step 1: Audit current structure
find src -name "*.tsx" -o -name "*.ts" | head -100

# Step 2: Create new structure
mkdir -p src/{shared/{ui,api,lib,hooks,config,types},entities,features,widgets,testing/{mocks,utils}}

# Step 3: Move files (preserve git history)
git mv src/lib/format.ts src/shared/lib/format.ts
git mv src/lib/httpClient.ts src/shared/api/httpClient.ts
git mv src/components/common/StatusBadge.tsx src/shared/ui/StatusBadge.tsx

# Step 4: Update imports (use sed or IDE refactor)
# Step 5: Validate
npm run typecheck && npm run lint && npm run build
```

## Decision Framework (2025/2026)

### "Where should this file go?"

```
┌──────────────────────────────────────────────────────────────────┐
│                    FILE PLACEMENT DECISION TREE                   │
└──────────────────────────────────────────────────────────────────┘

Q1: Does it know about the business domain?
    ├─ NO  → src/shared/
    │        ├─ React component? → shared/ui/
    │        ├─ React hook? → shared/hooks/
    │        ├─ API infrastructure? → shared/api/
    │        ├─ Utility function? → shared/lib/
    │        └─ Configuration? → shared/config/
    │
    └─ YES → Continue to Q2

Q2: What business concept does it represent?
    ├─ Core domain object (Alert, Incident, Node, User)
    │   └─ src/entities/{concept}/
    │        ├─ Display component? → entities/{concept}/ui/
    │        ├─ Data logic/hooks? → entities/{concept}/model/
    │        └─ CRUD operations? → entities/{concept}/api/
    │
    ├─ User action/interaction (Acknowledge, Filter, Export)
    │   └─ src/features/{action}/
    │        ├─ Action UI? → features/{action}/ui/
    │        ├─ Business logic? → features/{action}/model/
    │        └─ Action API? → features/{action}/api/
    │
    ├─ Complex composed UI block (Dashboard Panel, Data Table)
    │   └─ src/widgets/{block}/
    │        ├─ Composed UI? → widgets/{block}/ui/
    │        └─ Widget state? → widgets/{block}/model/
    │
    └─ Route/Page composition
        └─ src/pages/{route}/
             ├─ Page UI? → pages/{route}/ui/
             ├─ Page state? → pages/{route}/model/
             └─ Page API? → pages/{route}/api/

Q3: Is it a test?
    ├─ Unit test → Co-locate: Component.test.tsx next to Component.tsx
    ├─ Integration test → src/testing/
    └─ Mock/fixture → src/testing/mocks/

Q4: Is it a static asset?
    ├─ Needs build processing → src/assets/ (images, fonts)
    └─ Served as-is → public/ (favicon, robots.txt)
```

### Quick Reference

| If you're creating... | Put it in... |
|----------------------|--------------|
| Generic Button, Card, Modal | `shared/ui/` |
| useDebounce, useLocalStorage | `shared/hooks/` |
| httpClient, queryClient | `shared/api/` |
| formatDate, formatCurrency | `shared/lib/` |
| AlertCard, AlertBadge | `entities/alert/ui/` |
| useAlerts, alertStore | `entities/alert/model/` |
| fetchAlerts, updateAlert | `entities/alert/api/` |
| AcknowledgeButton | `features/acknowledge-alert/ui/` |
| useAcknowledge | `features/acknowledge-alert/model/` |
| AlertsDashboardPanel | `widgets/alerts-panel/ui/` |
| OverviewPage | `pages/overview/ui/` |

## Common Patterns (2025/2026 Best Practices)

### Pattern 1: Entity with Full Segments
```
src/entities/alert/
├── index.ts                   # Public API
├── ui/
│   ├── AlertCard.tsx          # Entity display component
│   ├── AlertBadge.tsx         # Severity indicator
│   └── AlertIcon.tsx          # Alert type icon
├── model/
│   ├── types.ts               # Alert, AlertSeverity, AlertStatus
│   ├── useAlerts.ts           # Data access hook
│   ├── alertStore.ts          # Zustand/Redux slice (if needed)
│   └── alertHelpers.ts        # Entity-specific calculations
└── api/
    ├── alertApi.ts            # CRUD: fetchAlerts, createAlert, etc.
    └── alertMappers.ts        # API response transformers
```

### Pattern 2: Feature (User Action)
```
src/features/acknowledge-alert/
├── index.ts                   # Public API
├── ui/
│   └── AcknowledgeButton.tsx  # The action trigger component
├── model/
│   ├── useAcknowledge.ts      # Action logic hook
│   └── types.ts               # AcknowledgePayload, etc.
└── api/
    └── acknowledgeApi.ts      # POST /alerts/:id/acknowledge
```

### Pattern 3: Widget (Composed UI Block)
```
src/widgets/alerts-panel/
├── index.ts                   # Public API
├── ui/
│   ├── AlertsPanel.tsx        # Main widget component
│   ├── AlertsHeader.tsx       # Panel header with filters
│   └── AlertsList.tsx         # Scrollable alerts list
└── model/
    ├── useAlertsPanel.ts      # Widget state (filters, pagination)
    └── types.ts               # WidgetConfig, FilterState
```

### Pattern 4: Page with Segments
```
src/pages/overview/
├── index.ts                   # Lazy-loaded export
├── ui/
│   ├── OverviewPage.tsx       # Main page component
│   ├── TopRisksNetwork.tsx    # Page-specific visualization
│   ├── RiskBreakdownPie.tsx   # Page-specific chart
│   └── NodeDetailsDrawer.tsx  # Page-specific drawer
└── model/
    ├── graphHelpers.ts        # Page-specific data transforms
    └── useOverviewState.ts    # Page-level state
```

### Pattern 5: Shared UI (Design System)
```
src/shared/ui/
├── Button.tsx                 # Generic button
├── Card.tsx                   # Generic card container
├── Modal.tsx                  # Generic modal
├── Input.tsx                  # Generic input field
├── PageHeader.tsx             # Standard page header
├── Section.tsx                # Content section wrapper
├── EmptyState.tsx             # Empty state display
├── StatusBadge.tsx            # Generic status indicator
├── Skeleton.tsx               # Loading skeleton
└── charts/
    ├── TimeSeriesLineChart.tsx  # Generic time series chart
    └── PieChart.tsx             # Generic pie chart
```

### Pattern 6: Shared API Infrastructure
```
src/shared/api/
├── httpClient.ts              # Base Axios/fetch wrapper
├── queryClient.ts             # React Query configuration
├── apiTypes.ts                # ApiResponse<T>, ApiError, etc.
├── interceptors.ts            # Auth, error handling interceptors
└── endpoints.ts               # Base URL configuration
```

## Audit Report Template

```
# Project Structure Audit Report
Generated: {date}
Methodology: Feature-Sliced Design + Bulletproof React (2025/2026)

## Current Structure Status
📊 Layer Compliance:
  - App Layer:      ✅ Compliant
  - Pages Layer:    ⚠️ 3 violations  
  - Widgets Layer:  ✅ Compliant
  - Features Layer: 🔴 Missing (0 features extracted)
  - Entities Layer: 🔴 Missing (0 entities defined)
  - Shared Layer:   ⚠️ 5 files should move here

📈 Overall Score: 45% compliant

## Layer Boundary Analysis

### Import Violations
| From | To | Violation Type |
|------|----|----------------|
| src/widgets/alerts | src/pages/overview | Widget importing from page |
| src/lib/alertsApiClient | src/components | Should be in entities or shared |

### Cross-Feature Imports (Should be 0)
❌ None detected - features layer not yet created

## Violations by Priority

### 🔴 CRITICAL: Layer Boundary Violations (5)
1. `src/lib/types.ts` contains entity-specific types
   - Move Alert types → `src/entities/alert/model/types.ts`
   - Move Incident types → `src/entities/incident/model/types.ts`
   - Keep generic types → `src/shared/types/`

2. `src/lib/alertsApiClient.ts` has business logic
   - Move → `src/entities/alert/api/alertApi.ts`

### 🟠 HIGH: Missing Public APIs (8)
1. `src/widgets/alerts/` has no index.ts
2. `src/pages/overview/` imports directly from internal files

### 🟡 MEDIUM: Segment Violations (12)
1. Hooks in `ui/` folders → Move to `model/`
2. Types scattered across files → Consolidate

## Proposed Migration Plan

### Phase 1: Create Shared Layer
```bash
mkdir -p src/shared/{ui,api,lib,hooks,config,types}
git mv src/lib/format.ts src/shared/lib/
git mv src/lib/httpClient.ts src/shared/api/
git mv src/components/common/* src/shared/ui/
git mv src/components/layout/* src/shared/ui/
git mv src/components/charts/* src/shared/ui/charts/
```

### Phase 2: Create Entities
```bash
mkdir -p src/entities/{alert,incident,node,metric}/{{ui,model,api}}
# Move entity-specific types, components, API calls
```

### Phase 3: Add Public APIs
```bash
touch src/entities/*/index.ts
touch src/widgets/*/index.ts
touch src/pages/*/index.ts
```

### Phase 4: Update Imports
- Total files to update: 47
- Automated with: `npx tsc-alias` or IDE refactor

## Validation Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (with new ESLint rules)
- [ ] `npm run build` succeeds
- [ ] No circular dependencies (check with `madge`)
- [ ] Git history preserved for moved files
- [ ] All public APIs export correctly
```

## Tooling & Enforcement (2025/2026 Stack)

### Recommended Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| **Steiger** | FSD architecture linter | `npm i -D @feature-sliced/steiger` |
| **eslint-plugin-import** | Import order/restrictions | `npm i -D eslint-plugin-import` |
| **madge** | Circular dependency detection | `npm i -D madge` |
| **knip** | Dead code/export detection | `npm i -D knip` |
| **ts-prune** | Unused exports finder | `npm i -D ts-prune` |

### Steiger Configuration (FSD Linter)

```javascript
// steiger.config.js
module.exports = {
  rules: {
    'no-cross-layer-imports': 'error',
    'no-cross-slice-imports': 'error',
    'public-api-only': 'error',
  },
  layers: ['app', 'pages', 'widgets', 'features', 'entities', 'shared'],
};
```

### ESLint Import Restrictions

```javascript
// eslint.config.js
export default [
  {
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // Shared cannot import from layers above
            {
              target: './src/shared',
              from: ['./src/entities', './src/features', './src/widgets', './src/pages', './src/app'],
              message: 'Shared layer cannot import from layers above',
            },
            // Entities can only import from shared
            {
              target: './src/entities',
              from: ['./src/features', './src/widgets', './src/pages', './src/app'],
              message: 'Entities can only import from shared',
            },
            // Features cannot import from widgets, pages, or app
            {
              target: './src/features',
              from: ['./src/widgets', './src/pages', './src/app'],
              message: 'Features can only import from entities and shared',
            },
            // Widgets cannot import from pages or app
            {
              target: './src/widgets',
              from: ['./src/pages', './src/app'],
              message: 'Widgets can only import from features, entities, and shared',
            },
            // Prevent cross-feature imports
            {
              target: './src/features/*',
              from: './src/features/*',
              except: ['.'],
              message: 'Features cannot import from other features',
            },
          ],
        },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
          pathGroups: [
            { pattern: '@app/**', group: 'internal', position: 'before' },
            { pattern: '@pages/**', group: 'internal', position: 'before' },
            { pattern: '@widgets/**', group: 'internal', position: 'before' },
            { pattern: '@features/**', group: 'internal', position: 'before' },
            { pattern: '@entities/**', group: 'internal', position: 'before' },
            { pattern: '@shared/**', group: 'internal', position: 'before' },
          ],
          'newlines-between': 'always',
        },
      ],
    },
  },
];
```

### CI/CD Enforcement

```yaml
# .github/workflows/architecture.yml
name: Architecture Check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx steiger check
      - run: npx madge --circular src/
      - run: npm run lint -- --max-warnings 0
```

## Reference Standards & Sources

This structure is based on 2025/2026 industry best practices from:

### Primary Methodologies
- **[Feature-Sliced Design](https://feature-sliced.design)** - Official FSD methodology
- **[Bulletproof React](https://github.com/alan2207/bulletproof-react)** - Production-ready patterns (34k+ stars)

### Key Principles Applied
1. **Unidirectional Dependencies** (FSD) - Higher layers depend on lower layers only
2. **Public API Rule** (FSD) - Modules expose only intentional interfaces
3. **Feature-Based Organization** (Bulletproof) - Code organized by domain, not type
4. **No Barrel File Abuse** (Vite/2024+) - Direct imports for tree-shaking (75% faster)
5. **ESLint Boundary Enforcement** - Automated architecture compliance
6. **Co-location** - Tests, types, utils live with their source
7. **Composition at App Level** - Features compose in pages, never cross-import

### Architecture Comparison

| Approach | Scale | Team Size | Complexity |
|----------|-------|-----------|------------|
| Simple (components/) | Small | 1-2 devs | Low |
| Bulletproof React | Medium | 3-10 devs | Medium |
| Feature-Sliced Design | Large | 10+ devs | High |
| **Hybrid (This Guide)** | **Medium-Large** | **3-20 devs** | **Medium-High** |

### When to Migrate

**Migrate to FSD when:**
- Features are spreading across unrelated folders
- New devs take weeks to understand codebase
- Refactoring causes unexpected regressions
- Teams step on each other's toes

**Don't migrate if:**
- App is < 10 components total
- Solo developer with full context
- Shipping fast matters more than structure

## Success Criteria

Architecture is compliant when:
1. ✅ All layers have proper boundaries (no upward imports)
2. ✅ All slices have public API (index.ts)
3. ✅ Zero cross-feature/cross-entity imports
4. ✅ All shared code is domain-agnostic
5. ✅ ESLint import rules pass
6. ✅ Steiger architecture check passes
7. ✅ No circular dependencies (madge)
8. ✅ Build succeeds with tree-shaking
9. ✅ New features can be added in isolated slices
10. ✅ Code can be understood by layer traversal
