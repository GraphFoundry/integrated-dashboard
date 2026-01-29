---
name: Tailwind Styling
description: 'Tailwind CSS styling standards and patterns'
applyTo: 'src/**/*.tsx, tailwind.config.ts, src/styles/**/*.css'
---

# Tailwind CSS Styling Standards

## Core Principles

1. **Utility-First** - Use Tailwind classes, avoid custom CSS
2. **Design Tokens** - Use configured values, not arbitrary ones
3. **Responsive First** - Mobile-first, then larger breakpoints
4. **Consistent Spacing** - Use the spacing scale

## Design Token Usage

### Colors (from tailwind.config.ts)
```tsx
// ✅ Use semantic color names
<div className="bg-primary-600 text-white" />
<span className="text-gray-500" />
<div className="border-error-500" />

// ❌ Avoid arbitrary colors
<div className="bg-[#3b82f6]" />
```

### Spacing Scale
```tsx
// ✅ Use spacing scale
<div className="p-4 m-2 gap-6" />  // 16px, 8px, 24px

// ❌ Avoid arbitrary spacing
<div className="p-[13px] m-[7px]" />
```

### Typography
```tsx
// ✅ Use typography scale
<h1 className="text-2xl font-bold" />
<p className="text-sm text-gray-600" />

// ❌ Avoid arbitrary sizes
<h1 className="text-[22px]" />
```

## Component Styling Patterns

### Base Component Styling
```tsx
function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        // Base styles
        'rounded-lg border bg-white shadow-sm',
        // Custom classes (allow override)
        className
      )}
    >
      {children}
    </div>
  );
}
```

### cn() Utility for Class Merging
```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Variant Styling
```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        // Base styles
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        
        // Variant styles
        {
          'bg-primary-600 text-white hover:bg-primary-700': variant === 'primary',
          'bg-gray-100 text-gray-900 hover:bg-gray-200': variant === 'secondary',
          'hover:bg-gray-100': variant === 'ghost',
          'bg-error-600 text-white hover:bg-error-700': variant === 'danger',
        },
        
        // Size styles
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4': size === 'md',
          'h-12 px-6 text-lg': size === 'lg',
        },
        
        className
      )}
      {...props}
    />
  );
}
```

## Responsive Design

### Mobile-First Approach
```tsx
// ✅ Good: Mobile-first
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" />
<div className="p-4 md:p-6 lg:p-8" />

// ❌ Bad: Desktop-first
<div className="lg:grid-cols-3 md:grid-cols-2 grid-cols-1" />
```

### Breakpoint Reference
| Prefix | Min Width | Usage |
|--------|-----------|-------|
| (none) | 0px | Mobile (default) |
| `sm:` | 640px | Large phones |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large screens |

## Common Patterns

### Card Layout
```tsx
<article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
  <header className="mb-4">
    <h2 className="text-lg font-semibold text-gray-900">Title</h2>
    <p className="text-sm text-gray-500">Subtitle</p>
  </header>
  <div className="space-y-4">
    {/* Content */}
  </div>
</article>
```

### Flex Layouts
```tsx
// Horizontal with gap
<div className="flex items-center gap-4">
  <Icon />
  <span>Text</span>
</div>

// Space between
<div className="flex items-center justify-between">
  <span>Left</span>
  <span>Right</span>
</div>

// Stack (vertical)
<div className="flex flex-col gap-2">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Grid Dashboard Layout
```tsx
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
  <KPICard />
  <KPICard />
  <KPICard />
  <KPICard />
</div>

<div className="grid gap-6 lg:grid-cols-3">
  <div className="lg:col-span-2">
    {/* Main content */}
  </div>
  <aside>
    {/* Sidebar */}
  </aside>
</div>
```

### Status Colors
```tsx
// Status badges
const statusColors = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
};

<span className={cn('rounded-full px-2 py-1 text-xs font-medium', statusColors[status])}>
  {status}
</span>
```

## Best Practices

### Use Consistent Spacing
```tsx
// ✅ Good: Use spacing scale
<div className="space-y-4">
  <Section />
  <Section />
</div>

// ❌ Bad: Inconsistent spacing
<div>
  <Section className="mb-3" />
  <Section className="mb-5" />
</div>
```

### Group Related Classes
```tsx
// ✅ Good: Logical grouping
<button
  className={cn(
    // Layout
    'inline-flex items-center justify-center',
    // Sizing
    'h-10 px-4',
    // Typography
    'text-sm font-medium',
    // Colors
    'bg-primary-600 text-white',
    // Interactive
    'hover:bg-primary-700 focus:ring-2',
    // Transitions
    'transition-colors duration-150'
  )}
/>
```

### Avoid @apply in CSS
```css
/* ❌ Avoid: @apply hides utilities */
.btn-primary {
  @apply bg-primary-600 text-white px-4 py-2;
}

/* ✅ Prefer: Component abstraction in TSX */
```

## References

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Component Instructions](./02-components.instructions.md)
