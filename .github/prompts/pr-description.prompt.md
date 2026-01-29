---
agent: agent
description: Generate a comprehensive PR description
---

# PR Description

Generate a comprehensive pull request description.

## Input Required

- **Changes**: Summary of what was changed (or detect from git)
- **Issue**: Related issue number (if applicable)
- **Type**: `feature` | `bugfix` | `refactor` | `chore`

## PR Template

```markdown
## Summary

[Brief description of what this PR does]

### Type of Change

- [ ] 🚀 Feature (new functionality)
- [ ] 🐛 Bug fix (fixes an issue)
- [ ] 🔄 Refactor (code improvement, no behavior change)
- [ ] 📦 Dependency update
- [ ] 📝 Documentation
- [ ] 🧪 Test
- [ ] 🔧 Chore (build, config, etc.)

### Related Issues

Closes #[issue_number]

---

## Changes Made

### Files Changed

| File | Changes |
|------|---------|
| `src/components/Button.tsx` | Added new variant prop |
| `src/lib/types.ts` | Added ButtonVariant type |

### What Changed

1. **[Area 1]**: Description of changes
   - Specific change 1
   - Specific change 2

2. **[Area 2]**: Description of changes
   - Specific change 1

---

## Testing

### Manual Testing

1. Navigate to [page]
2. Perform [action]
3. Verify [expected result]

### Automated Tests

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests pass locally

```bash
npm test
npm run typecheck
npm run lint
```

---

## Screenshots

[If applicable, add screenshots or videos]

| Before | After |
|--------|-------|
| [screenshot] | [screenshot] |

---

## Checklist

### Code Quality
- [ ] Code follows project style guidelines
- [ ] No `any` types introduced
- [ ] Components follow established patterns
- [ ] No console.log statements

### Testing
- [ ] Tests added for new functionality
- [ ] Existing tests pass
- [ ] Manual testing completed

### Documentation
- [ ] Code is self-documenting with clear names
- [ ] Complex logic has comments
- [ ] README updated (if needed)

### Accessibility
- [ ] Semantic HTML used
- [ ] ARIA labels added where needed
- [ ] Keyboard navigation works

### Performance
- [ ] No unnecessary re-renders introduced
- [ ] Large lists virtualized
- [ ] Expensive computations memoized

---

## Deployment Notes

[Any special considerations for deployment]

- [ ] Environment variables needed
- [ ] Database migrations required
- [ ] Feature flag needed

---

## Reviewer Notes

[Guidance for reviewers - what to focus on, areas of uncertainty]
```

## Generation Process

### 1. Detect Changes
```bash
# Get changed files
git diff --name-only main

# Get detailed changes
git diff main
```

### 2. Categorize Changes
Group files by:
- Components modified
- Types added/changed
- Tests added
- Config changes

### 3. Summarize Impact
- What feature/bug does this address?
- What's the user impact?
- What's the technical impact?

### 4. Document Testing
- What manual tests were performed?
- What automated tests cover this?

### 5. Add Context
- Why were these design decisions made?
- What alternatives were considered?
- What are the tradeoffs?

## Output

Complete PR description ready to paste into GitHub/GitLab.
