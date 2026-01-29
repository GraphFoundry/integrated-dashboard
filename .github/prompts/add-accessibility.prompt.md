---
agent: agent
description: Add or improve accessibility for components
---

# Add Accessibility

Audit and improve accessibility (a11y) for components.

## Input Required

- **Target**: Component or page to audit
- **Focus**: Specific WCAG criteria or "comprehensive"

## Accessibility Audit

### 1. Semantic HTML

```tsx
// ❌ Problem: Non-semantic elements
<div className="button" onClick={handleClick}>Submit</div>
<div className="header"><div className="title">Dashboard</div></div>

// ✅ Solution: Semantic elements
<button onClick={handleClick}>Submit</button>
<header><h1>Dashboard</h1></header>
```

### 2. Keyboard Navigation

```tsx
// ❌ Problem: Only mouse accessible
<div onClick={handleSelect} className="option">
  Option 1
</div>

// ✅ Solution: Keyboard accessible
<button
  onClick={handleSelect}
  onKeyDown={(e) => e.key === 'Enter' && handleSelect()}
  tabIndex={0}
  role="option"
  aria-selected={isSelected}
>
  Option 1
</button>
```

### 3. ARIA Labels

```tsx
// ❌ Problem: No accessible name
<button onClick={toggleMenu}>
  <MenuIcon />
</button>

// ✅ Solution: Accessible name
<button 
  onClick={toggleMenu}
  aria-label="Toggle navigation menu"
  aria-expanded={isOpen}
>
  <MenuIcon aria-hidden="true" />
</button>
```

### 4. Form Labels

```tsx
// ❌ Problem: No label association
<input type="email" placeholder="Email" />

// ✅ Solution: Proper labeling
<label htmlFor="email" className="sr-only">Email address</label>
<input 
  id="email"
  type="email" 
  placeholder="Email"
  aria-describedby="email-hint"
/>
<span id="email-hint">We'll never share your email</span>
```

### 5. Focus Management

```tsx
// ✅ Focus trap for modals
import { useEffect, useRef } from 'react';

function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      // Save current focus
      const previousFocus = document.activeElement;
      // Focus modal
      modalRef.current?.focus();
      
      return () => {
        // Restore focus on close
        (previousFocus as HTMLElement)?.focus();
      };
    }
  }, [isOpen]);

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
```

### 6. Color Contrast

```tsx
// ❌ Problem: Low contrast
<span className="text-gray-300 bg-gray-100">Low contrast</span>

// ✅ Solution: WCAG AA compliant (4.5:1 for text)
<span className="text-gray-700 bg-gray-100">High contrast</span>
```

### 7. Skip Links

```tsx
// ✅ Add skip link for keyboard users
<a 
  href="#main-content" 
  className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 bg-white p-4"
>
  Skip to main content
</a>

<main id="main-content" tabIndex={-1}>
  {/* Page content */}
</main>
```

## WCAG 2.1 AA Checklist

### Perceivable
- [ ] Images have alt text
- [ ] Videos have captions
- [ ] Color not sole indicator
- [ ] Text resizable to 200%
- [ ] Contrast ratio 4.5:1 (text), 3:1 (large text)

### Operable
- [ ] All functionality keyboard accessible
- [ ] No keyboard traps
- [ ] Skip links provided
- [ ] Focus visible
- [ ] No flashing content

### Understandable
- [ ] Language declared
- [ ] Consistent navigation
- [ ] Error prevention and recovery
- [ ] Labels and instructions

### Robust
- [ ] Valid HTML
- [ ] Name, role, value for custom widgets
- [ ] Status messages announced

## Screen Reader Utility Classes

```tsx
// Visually hidden but accessible
<span className="sr-only">Screen reader only text</span>

// Focus-only visible (skip links)
<a className="sr-only focus:not-sr-only">Skip to content</a>
```

## Testing Tools

```bash
# Automated audit
npx axe-core

# Manual testing
# 1. Tab through page
# 2. Use screen reader (VoiceOver, NVDA)
# 3. Check color contrast
# 4. Test zoom to 200%
```

## Output Format

```markdown
## Accessibility Audit: [Component]

### Issues Found (by WCAG criteria)

#### 1.1.1 Non-text Content
- **Issue**: Images missing alt text
- **Fix**: Add descriptive alt attributes

#### 2.1.1 Keyboard
- **Issue**: Custom dropdown not keyboard accessible
- **Fix**: Add keyboard handlers and ARIA

### Changes Made

1. Added aria-label to icon buttons
2. Replaced div with button for interactive elements
3. Added skip link to layout
4. Fixed focus management in modal

### Remaining Manual Tests

- [ ] Test with VoiceOver
- [ ] Test with NVDA
- [ ] Verify focus order
```
