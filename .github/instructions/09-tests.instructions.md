---
name: Testing Standards
description: 'Testing standards for React dashboard applications'
applyTo: 'src/**/*.test.ts, src/**/*.test.tsx, src/**/*.spec.ts, src/**/*.spec.tsx'
---

# Testing Standards

## Core Principles

1. **Test Behavior, Not Implementation** - What it does, not how
2. **User-Centric Tests** - Simulate real user interactions
3. **Accessible Queries** - Use ARIA roles and labels
4. **Independent Tests** - No test order dependencies

## Testing Stack

- **Test Runner**: Vitest
- **Component Testing**: React Testing Library
- **User Events**: @testing-library/user-event
- **API Mocking**: MSW (Mock Service Worker)
- **E2E**: Playwright (when applicable)

## Test File Organization

```
src/
├── components/
│   └── common/
│       ├── StatusBadge.tsx
│       └── __tests__/
│           └── StatusBadge.test.tsx
├── hooks/
│   ├── useAlerts.ts
│   └── __tests__/
│       └── useAlerts.test.ts
├── lib/
│   ├── format.ts
│   └── __tests__/
│       └── format.test.ts
└── pages/
    └── alerts/
        ├── Alerts.tsx
        └── __tests__/
            └── Alerts.test.tsx
```

## Test Structure Template

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  // Shared setup
  const defaultProps = {
    title: 'Test Title',
    onAction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with required props', () => {
      render(<ComponentName {...defaultProps} />);
      
      expect(screen.getByRole('heading', { name: /test title/i })).toBeInTheDocument();
    });

    it('renders optional content when provided', () => {
      render(<ComponentName {...defaultProps} subtitle="Test Subtitle" />);
      
      expect(screen.getByText(/test subtitle/i)).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onAction when button is clicked', async () => {
      const user = userEvent.setup();
      render(<ComponentName {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: /submit/i }));
      
      expect(defaultProps.onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('states', () => {
    it('shows loading state', () => {
      render(<ComponentName {...defaultProps} isLoading />);
      
      expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    });

    it('shows error state', () => {
      render(<ComponentName {...defaultProps} error="Failed to load" />);
      
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
    });
  });
});
```

## Query Priority (Most Preferred First)

### 1. Accessible Queries ✅
```typescript
// By role (most semantic)
screen.getByRole('button', { name: /submit/i });
screen.getByRole('heading', { level: 1 });
screen.getByRole('link', { name: /learn more/i });

// By label (form inputs)
screen.getByLabelText(/email/i);

// By placeholder (inputs)
screen.getByPlaceholderText(/search/i);

// By text (non-interactive)
screen.getByText(/welcome/i);
```

### 2. Semantic Queries
```typescript
screen.getByAltText(/company logo/i);
screen.getByTitle(/close/i);
```

### 3. Test IDs (Last Resort) ⚠️
```typescript
// Only when nothing else works
screen.getByTestId('complex-chart');
```

## User Event Patterns

```typescript
import userEvent from '@testing-library/user-event';

describe('form interactions', () => {
  it('handles form submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    
    render(<LoginForm onSubmit={onSubmit} />);
    
    // Type in inputs
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('handles keyboard navigation', async () => {
    const user = userEvent.setup();
    
    render(<DropdownMenu />);
    
    // Open with keyboard
    await user.tab(); // Focus trigger
    await user.keyboard('{Enter}'); // Open menu
    await user.keyboard('{ArrowDown}'); // Navigate
    await user.keyboard('{Enter}'); // Select
  });
});
```

## Hook Testing

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useAlerts } from '../useAlerts';

describe('useAlerts', () => {
  it('returns loading state initially', () => {
    const { result } = renderHook(() => useAlerts());
    
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('returns data after loading', async () => {
    const { result } = renderHook(() => useAlerts());
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(result.current.data).toHaveLength(5);
    expect(result.current.error).toBeNull();
  });

  it('returns error on failure', async () => {
    server.use(
      rest.get('/api/alerts', (req, res, ctx) => {
        return res(ctx.status(500));
      })
    );

    const { result } = renderHook(() => useAlerts());
    
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });
});
```

## MSW API Mocking

```typescript
// src/mocks/handlers.ts
import { rest } from 'msw';

export const handlers = [
  rest.get('/api/alerts', (req, res, ctx) => {
    return res(
      ctx.json({
        data: mockAlerts,
        pagination: { total: 10, limit: 10, offset: 0 },
      })
    );
  }),

  rest.post('/api/alerts/:id/acknowledge', (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),
];

// src/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// vitest.setup.ts
import { server } from './src/mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## What to Test

### Components
- Renders with required props
- Renders optional content when provided
- User interactions trigger callbacks
- Loading/error/empty states display
- Accessibility (ARIA, keyboard)

### Hooks
- Initial state
- State after data loads
- Error handling
- Cleanup on unmount

### Utilities
- All input variations
- Edge cases (null, empty, invalid)
- Error handling

## What NOT to Test

- Implementation details (internal state names)
- Third-party library internals
- Styling (unless business logic)
- Exact text matching (use regex)

## References

- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Documentation](https://vitest.dev/)
- [MSW Documentation](https://mswjs.io/)
