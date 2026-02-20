# Copilot PR Guidelines

Guidelines for AI-assisted pull request creation.

## PR Title Format

```
<type>(<scope>): <description>
```

Same types and scopes as commit messages.

## PR Template

```markdown
## Summary

[Brief description of what this PR does]

### Type of Change

- [ ] 🚀 Feature
- [ ] 🐛 Bug fix
- [ ] 🔄 Refactor
- [ ] 📝 Documentation
- [ ] 🧪 Test

### Related Issues

Closes #[issue_number]

---

## Changes Made

### Files Changed

| File | Changes |
|------|---------|
| `path/file.tsx` | Description |

### What Changed

1. **[Area]**: Description

---

## Testing

### Manual Testing
1. [Step 1]
2. [Step 2]

### Automated Tests
- [ ] Unit tests pass
- [ ] Integration tests pass

---

## Checklist

### Code Quality
- [ ] Follows project patterns
- [ ] No `any` types
- [ ] No console.log statements

### Testing
- [ ] Tests added for new functionality
- [ ] All tests pass

### Accessibility
- [ ] Semantic HTML used
- [ ] Keyboard navigation works

---

## Screenshots

[If applicable]

---

## Reviewer Notes

[Guidance for reviewers]
```

## AI Prompt for PR Description

```
Generate a PR description for these changes:
- Summarize what changed
- List files modified
- Explain testing done
- Include any breaking changes
```

## Best Practices

### Keep PRs Focused
- One feature/fix per PR
- Max ~400 lines changed
- Split large changes into multiple PRs

### Write Good Descriptions
- Explain the "why"
- Link to issues
- Include screenshots for UI changes
- Note any breaking changes

### Review Readiness
Before requesting review:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## PR Size Guidelines

| Size | Lines | Recommendation |
|------|-------|----------------|
| XS | 0-50 | ✅ Quick review |
| S | 50-200 | ✅ Normal review |
| M | 200-400 | ⚠️ May need split |
| L | 400-800 | ⚠️ Split if possible |
| XL | 800+ | ❌ Must split |

## Review Expectations

### Author Responsibilities
- Self-review before requesting
- Respond to feedback promptly
- Keep PR up to date with base branch
- Squash commits if messy

### Reviewer Responsibilities
- Review within 1 business day
- Be constructive and specific
- Approve only when satisfied
- Focus on correctness, not style (that's for linters)
