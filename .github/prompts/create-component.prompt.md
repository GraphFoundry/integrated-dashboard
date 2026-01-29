---
agent: agent
description: Create a new React component following project standards
---

# Create Component

Create a new React component following all project standards.

## Input Required

- **Component Name**: PascalCase name (e.g., `AlertCard`, `MetricBadge`)
- **Category**: `common` | `charts` | `layout` | `forms`
- **Purpose**: Brief description of what the component does

## Process

1. **Determine Location**
   - Common UI components: `src/components/common/`
   - Chart components: `src/components/charts/`
   - Layout components: `src/components/layout/`
   - Form components: `src/components/forms/`

2. **Check for Similar Components**
   - Search existing components to avoid duplication
   - Consider extending existing components instead

3. **Generate Component**
   - Use functional component with hooks only
   - Define TypeScript interface for props
   - Include explicit return types
   - Add JSDoc comments for complex props

4. **Apply Standards**
   Follow `.github/instructions/02-components.instructions.md`:
   - Module-level component definition
   - Proper hooks usage order
   - Loading/error/empty state handling
   - Semantic HTML elements
   - Tailwind utility classes

## Output Template

```tsx
import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ${ComponentName}Props extends HTMLAttributes<HTMLDivElement> {
  /** Primary content or value to display */
  value: string;
  /** Visual variant of the component */
  variant?: 'default' | 'primary' | 'secondary';
}

/**
 * ${ComponentName} - Brief description
 * 
 * @example
 * <${ComponentName} value="Example" variant="primary" />
 */
export function ${ComponentName}({
  value,
  variant = 'default',
  className,
  ...props
}: ${ComponentName}Props) {
  return (
    <div
      className={cn(
        'base-styles',
        variant === 'primary' && 'primary-styles',
        className
      )}
      {...props}
    >
      {value}
    </div>
  );
}
```

## Checklist

- [ ] Props interface defined with JSDoc
- [ ] Component exported as named export
- [ ] className prop supported for customization
- [ ] Rest props spread for extensibility
- [ ] Semantic HTML elements used
- [ ] Tailwind utilities applied
- [ ] No inline styles
- [ ] No component definitions inside component
