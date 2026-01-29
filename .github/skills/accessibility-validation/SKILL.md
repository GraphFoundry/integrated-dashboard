---
name: Accessibility Validation
description: WCAG 2.1 AA compliance patterns and testing strategies for React dashboards
---

# Accessibility Validation

WCAG 2.1 AA compliance patterns and testing strategies for React dashboards.

## When to Use This Skill

- Building new interactive components
- Auditing existing components for a11y issues
- Implementing keyboard navigation
- Adding screen reader support
- Fixing color contrast issues

## Core Principles (POUR)

1. **Perceivable** - Information must be presentable to users
2. **Operable** - Interface must be operable by all users
3. **Understandable** - Information and operation must be understandable
4. **Robust** - Content must be robust enough for assistive technologies

## Implementation Patterns

### 1. Semantic HTML

```tsx
// ❌ Non-semantic
<div className="button" onClick={handleClick}>Submit</div>
<div className="header">
  <div className="nav">
    <div className="link" onClick={navigate}>Home</div>
  </div>
</div>

// ✅ Semantic
<button onClick={handleClick}>Submit</button>
<header>
  <nav>
    <a href="/">Home</a>
  </nav>
</header>
```

### 2. Keyboard Navigation

```tsx
function Menu({ items }: MenuProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(i => Math.min(i + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        items[focusedIndex].action();
        break;
      case 'Escape':
        onClose();
        break;
    }
  };
  
  return (
    <ul role="menu" onKeyDown={handleKeyDown}>
      {items.map((item, index) => (
        <li
          key={item.id}
          role="menuitem"
          tabIndex={focusedIndex === index ? 0 : -1}
          ref={el => focusedIndex === index && el?.focus()}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
```

### 3. Focus Management

```tsx
function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousFocus.current = document.activeElement as HTMLElement;
      // Focus modal
      modalRef.current?.focus();
    } else {
      // Restore focus
      previousFocus.current?.focus();
    }
  }, [isOpen]);
  
  // Focus trap
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}
```

### 4. ARIA Patterns

#### Live Regions
```tsx
// Announce dynamic content to screen readers
function Notifications() {
  const [message, setMessage] = useState('');
  
  return (
    <div 
      role="status" 
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
```

#### Expanded/Collapsed
```tsx
function Accordion({ title, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  
  return (
    <div>
      <button
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
      </button>
      <div 
        id={id} 
        hidden={!isOpen}
        role="region"
        aria-labelledby={`${id}-trigger`}
      >
        {children}
      </div>
    </div>
  );
}
```

### 5. Form Accessibility

```tsx
function Form() {
  const [error, setError] = useState('');
  
  return (
    <form>
      <div>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          aria-describedby="email-hint email-error"
          aria-invalid={!!error}
          required
        />
        <span id="email-hint" className="text-sm text-gray-500">
          We'll never share your email
        </span>
        {error && (
          <span id="email-error" role="alert" className="text-red-600">
            {error}
          </span>
        )}
      </div>
      
      <button type="submit">Subscribe</button>
    </form>
  );
}
```

### 6. Skip Links

```tsx
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:p-4 focus:shadow-lg"
      >
        Skip to main content
      </a>
      
      <nav aria-label="Main navigation">
        {/* Navigation */}
      </nav>
      
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
```

## Testing Strategies

### Automated Testing
```bash
# axe-core
npm install --save-dev @axe-core/react

# In tests
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('has no accessibility violations', async () => {
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Manual Testing Checklist
- [ ] Tab through entire page
- [ ] Verify focus is visible
- [ ] Test with screen reader (VoiceOver, NVDA)
- [ ] Check color contrast (4.5:1 text, 3:1 large text)
- [ ] Zoom to 200%
- [ ] Test without mouse

## WCAG 2.1 AA Quick Reference

| Criterion | Requirement |
|-----------|-------------|
| 1.1.1 | Non-text content has text alternative |
| 1.4.3 | Contrast ratio 4.5:1 (text), 3:1 (large) |
| 2.1.1 | All functionality keyboard accessible |
| 2.1.2 | No keyboard traps |
| 2.4.3 | Focus order is logical |
| 2.4.7 | Focus is visible |
| 4.1.2 | Name, role, value for UI components |

## Tailwind Utility Classes

```tsx
// Screen reader only
<span className="sr-only">Accessible text</span>

// Focus visible only
<a className="sr-only focus:not-sr-only">Skip to content</a>

// Focus ring
<button className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
```

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Inclusive Components](https://inclusive-components.design/)
