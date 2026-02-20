# Copilot Commit Guidelines

Guidelines for AI-assisted commit message generation.

## Commit Message Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

## Types

| Type | Description |
|------|-------------|
| `feat` | New feature for the user |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semicolons, etc. |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build process, dependencies, etc. |

## Scopes

For this dashboard project, use these scopes:

| Scope | Description |
|-------|-------------|
| `components` | Shared UI components |
| `pages` | Page components |
| `widgets` | Widget components |
| `hooks` | Custom hooks |
| `api` | API clients |
| `types` | TypeScript types |
| `styles` | CSS/Tailwind changes |
| `tests` | Test files |
| `config` | Configuration files |

## Examples

### Feature
```
feat(components): add StatusBadge component

- Create StatusBadge with variant support
- Add success, warning, error, info variants
- Include Tailwind styling
```

### Fix
```
fix(hooks): prevent stale closure in useAlerts

useAlerts was using stale filter values due to missing
dependency in useCallback. Added filters to dependency array.

Fixes #123
```

### Refactor
```
refactor(pages): extract AlertsTable to separate component

Move table rendering logic from AlertsPage to dedicated
AlertsTable component for better maintainability.
```

### Performance
```
perf(widgets): virtualize MetricsList for large datasets

Implement react-window for MetricsList to handle 1000+
metrics without performance degradation.
```

## Rules

1. **Subject line**
   - Max 50 characters
   - Imperative mood ("add" not "added")
   - No period at end
   - Lowercase

2. **Body**
   - Wrap at 72 characters
   - Explain what and why, not how
   - Separate from subject with blank line

3. **Footer**
   - Reference issues: `Fixes #123`
   - Breaking changes: `BREAKING CHANGE: description`

## AI Prompt for Commits

When asking Copilot to generate a commit message:

```
Generate a commit message for these changes following conventional commits:
- Type: [feat|fix|refactor|...]
- Scope: [component|page|hook affected]
- Include what changed and why
```

## Anti-Patterns

```
# ❌ Bad
"Fixed stuff"
"WIP"
"Update AlertCard.tsx"
"Changes"

# ✅ Good
"fix(components): handle null prop in AlertCard"
"feat(pages): add pagination to MetricsPage"
"refactor(hooks): simplify useDebounce implementation"
```
