---
name: Find Skills
description: Discover and recommend skills for implementing features in the React dashboard
---

# Find Skills

Discover and recommend skills for implementing features in the React dashboard.

## When to Use This Skill

- User asks "how do I do X"
- User is looking for patterns for a specific task
- User needs to extend Copilot's capabilities
- User wants to know available skills

## Available Skills

### 1. react-component-patterns
**Use when:** Building complex components, deciding between patterns (compound, render props, polymorphic), implementing reusable UI

**Covers:**
- Compound components
- Render props
- Controlled vs uncontrolled
- Polymorphic components
- Slot patterns

### 2. performance-optimization
**Use when:** Debugging slow renders, optimizing large lists, reducing bundle size, fixing memory leaks

**Covers:**
- Re-render optimization
- useMemo/useCallback patterns
- Code splitting
- Bundle analysis
- Memory leak prevention

### 3. accessibility-validation
**Use when:** Building accessible components, keyboard navigation, screen reader support, WCAG compliance

**Covers:**
- Semantic HTML
- ARIA patterns
- Focus management
- Color contrast
- Testing strategies

### 4. state-management-patterns
**Use when:** Deciding state location, complex form state, server state, Context optimization

**Covers:**
- Local vs lifted vs context state
- useReducer patterns
- Derived state
- URL state sync
- Form state

### 5. testing-patterns
**Use when:** Writing tests, mocking APIs, testing hooks, choosing test strategies

**Covers:**
- Component testing
- Hook testing
- MSW mocking
- Query priority
- Testing patterns

## Skill Selection Guide

| User Request | Recommended Skill |
|--------------|-------------------|
| "Component keeps re-rendering" | performance-optimization |
| "Build a dropdown/modal/tabs" | react-component-patterns |
| "Make this keyboard accessible" | accessibility-validation |
| "Where should I put this state" | state-management-patterns |
| "How do I test this component" | testing-patterns |
| "Add screen reader support" | accessibility-validation |
| "Reduce bundle size" | performance-optimization |
| "Build a form with validation" | state-management-patterns |
| "Create a reusable component" | react-component-patterns |
| "Mock API responses in tests" | testing-patterns |

## External Skills

Additional skills can be installed from the Copilot skills registry:

```bash
# Install a skill globally
npx skills add vercel-labs/agent-skills@skill-name -g

# List installed skills
npx skills list

# Popular skills:
# - vercel-react-best-practices
# - web-design-guidelines
# - systematic-debugging
# - test-driven-development
```

## Skill Discovery Questions

To recommend the right skill, ask:

1. What are you trying to build/fix?
2. Is it a component, hook, or utility?
3. Are you having a specific problem?
4. What patterns have you already tried?

## Creating New Skills

If no existing skill covers your need, create one:

```markdown
# Skill Name

Brief description.

## When to Use This Skill
- Trigger condition 1
- Trigger condition 2

## [Main Content]
Detailed patterns, examples, and guidance.

## References
- Links to documentation
- Links to related instructions
```

Place in: `.github/skills/{skill-name}/SKILL.md`

## Skill Usage Format

When a skill is selected, provide:

1. **Context**: Why this skill applies
2. **Pattern**: Specific pattern to use
3. **Example**: Code example
4. **References**: Links to full skill documentation

Example response:

> For building an accessible dropdown, use the **accessibility-validation** skill.
>
> **Pattern**: Keyboard navigation with roving tabindex
>
> ```tsx
> // Example code from skill...
> ```
>
> See [accessibility-validation/SKILL.md] for full documentation.
