---
agent: agent
description: Create a detailed implementation plan for a feature or change
---

# Plan Change

Create a comprehensive implementation plan before making changes.

## Input Required

- **Feature/Change**: What needs to be implemented
- **Requirements**: Specific requirements or constraints
- **Context**: Related features or dependencies

## Planning Template

```markdown
# Implementation Plan: [Feature Name]

## 1. Overview

### Goal
[What this change accomplishes]

### Success Criteria
- [ ] [Measurable outcome 1]
- [ ] [Measurable outcome 2]
- [ ] [Measurable outcome 3]

---

## 2. Analysis

### Current State
[How the system works now]

### Impacted Areas
- Files: [list of files to modify]
- Components: [components affected]
- APIs: [endpoints involved]
- Tests: [test files to update]

### Dependencies
- [Dependency 1]: [why needed]
- [Dependency 2]: [why needed]

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Strategy] |

---

## 3. Design

### Architecture
[High-level design, data flow, component structure]

### API Changes
```typescript
// New endpoints or changes
interface NewEndpoint {
  path: '/api/feature';
  method: 'POST';
  body: { ... };
  response: { ... };
}
```

### Component Structure
```
src/
├── pages/feature/
│   ├── Feature.tsx           # Main page
│   └── components/
│       ├── FeatureForm.tsx   # Form component
│       └── FeatureList.tsx   # List component
├── hooks/
│   └── useFeature.ts         # Data hook
└── lib/
    └── featureApiClient.ts   # API client
```

### State Management
[How state will be managed]

---

## 4. Implementation Steps

### Phase 1: Foundation
- [ ] Create types in `src/lib/types.ts`
- [ ] Add API client methods
- [ ] Create custom hook

### Phase 2: Components
- [ ] Create base component
- [ ] Add form handling
- [ ] Implement list view

### Phase 3: Integration
- [ ] Add route configuration
- [ ] Connect to navigation
- [ ] Wire up data flow

### Phase 4: Testing
- [ ] Unit tests for utilities
- [ ] Component tests
- [ ] Integration tests

### Phase 5: Polish
- [ ] Add loading states
- [ ] Handle errors
- [ ] Accessibility review
- [ ] Performance check

---

## 5. Testing Strategy

### Unit Tests
- [Function/hook]: [test scenarios]

### Component Tests
- [Component]: [test scenarios]

### Integration Tests
- [Flow]: [test scenarios]

---

## 6. Rollout Plan

### Pre-release
- [ ] All tests pass
- [ ] Code review approved
- [ ] Documentation updated

### Release
- [ ] Feature flag (if applicable)
- [ ] Deploy to staging
- [ ] Smoke test

### Post-release
- [ ] Monitor for errors
- [ ] Gather feedback
- [ ] Address issues

---

## 7. Estimated Effort

| Task | Estimate |
|------|----------|
| Foundation | 2 hours |
| Components | 4 hours |
| Integration | 2 hours |
| Testing | 3 hours |
| Polish | 2 hours |
| **Total** | **13 hours** |

---

## 8. Open Questions

- [ ] [Question 1 that needs clarification]
- [ ] [Question 2 that needs clarification]
```

## Planning Process

### 1. Understand Requirements
- What problem does this solve?
- Who are the users?
- What are the constraints?

### 2. Research Existing Code
```bash
# Find related code
grep -r "relatedTerm" src/

# Check existing patterns
ls -la src/pages/
ls -la src/components/
```

### 3. Identify Dependencies
- What other features are affected?
- What needs to be built first?
- What can be done in parallel?

### 4. Break Down Tasks
- Each task should be completable in < 4 hours
- Tasks should be testable independently
- Order tasks by dependency

### 5. Estimate and Prioritize
- Consider complexity and risk
- Identify blockers early
- Plan for testing time

## Output

Provide:
1. Complete planning document
2. File-by-file change list
3. Risk assessment
4. Time estimates
