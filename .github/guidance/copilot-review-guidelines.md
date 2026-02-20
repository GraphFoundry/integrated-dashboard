# Copilot Code Review Guidelines

Guidelines for conducting AI-assisted code reviews.

## Review Focus Areas

### 1. Correctness
- Does the code do what it's supposed to?
- Are edge cases handled?
- Is error handling adequate?

### 2. Architecture
- Does it follow project patterns?
- Is the component/hook in the right place?
- Are dependencies appropriate?

### 3. Type Safety
- Are types explicit and correct?
- Any `any` types that should be removed?
- Are interfaces properly defined?

### 4. Performance
- Any unnecessary re-renders?
- Are memoizations appropriate?
- Large lists virtualized?

### 5. Accessibility
- Semantic HTML used?
- ARIA labels present?
- Keyboard navigation works?

## Review Checklist

### TypeScript
```
□ No `any` types
□ Explicit return types on exports
□ Props interfaces defined
□ Proper use of interface vs type
```

### React Components
```
□ No components defined inside components
□ Hooks at top level only
□ Complete dependency arrays
□ Loading/error/empty states handled
□ Semantic HTML elements
```

### Styling
```
□ Tailwind utilities only
□ No inline styles
□ Design tokens used
□ Mobile-first responsive
```

### Testing
```
□ Tests added for new functionality
□ Existing tests still pass
□ Accessible queries used
```

## Comment Guidelines

### Be Constructive
```markdown
# ❌ Bad
"This is wrong"
"Don't do this"

# ✅ Good
"Consider using useMemo here to prevent recalculation on each render"
"This could be simplified by extracting to a custom hook"
```

### Use Conventional Labels
```markdown
# Required change (blocks merge)
**[Required]** Add error handling for API failure

# Suggestion (nice to have)
**[Suggestion]** Consider memoizing this computation

# Question (need clarification)
**[Question]** Why was this approach chosen over X?

# Nitpick (style preference)
**[Nit]** Could use destructuring here for cleaner syntax
```

### Provide Examples
```markdown
**[Required]** Missing dependency in useEffect

Current:
```tsx
useEffect(() => {
  fetchData(userId);
}, []);
```

Suggested:
```tsx
useEffect(() => {
  fetchData(userId);
}, [userId]);
```
```

## Review Categories

### 🚨 Critical (Must Fix)
- Security vulnerabilities
- Data loss potential
- Breaking existing functionality
- Violating critical guardrails

### ⚠️ Warning (Should Fix)
- Performance issues
- Missing error handling
- Accessibility problems
- Code pattern violations

### 💡 Suggestion (Consider)
- Alternative approaches
- Optimization opportunities
- Better naming
- Documentation improvements

### 📝 Nitpick (Optional)
- Style preferences
- Minor formatting
- Comment improvements

## AI Review Prompt

```
Review this code against project standards:

1. Check for TypeScript best practices
2. Verify React patterns are correct
3. Look for performance issues
4. Check accessibility
5. Identify missing edge cases

Reference these instruction files:
- 01-types.instructions.md
- 02-components.instructions.md
- 99-critical-guardrails.instructions.md
```

## Review Workflow

1. **Understand Context**
   - Read PR description
   - Understand the goal
   - Check related issues

2. **Review Changes**
   - Start with the main component
   - Check types and interfaces
   - Review hooks and effects
   - Check tests

3. **Test Locally** (for significant changes)
   ```bash
   git checkout pr-branch
   npm install
   npm run dev
   npm test
   ```

4. **Provide Feedback**
   - Specific and actionable
   - Reference project standards
   - Suggest alternatives

5. **Approve or Request Changes**
   - Only approve when satisfied
   - Be clear about blockers
