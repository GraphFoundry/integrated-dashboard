---
name: Testing Patterns
description: Testing patterns and strategies for React dashboard applications
---

# Testing Patterns

Testing patterns and strategies for React dashboard applications.

## When to Use This Skill

- Writing component tests
- Testing custom hooks
- Mocking API calls
- Integration testing
- End-to-end testing decisions

## When NOT to Use This Skill

- Testing pure utility functions (use simple unit tests)
- When learning testing basics (assumes professional experience)
- For trivial components with no logic
- When snapshot testing would suffice (rare, but valid)

## Testing Pyramid

```
         /\
        /E2E\        ← Few, slow, high confidence
       /______\
      /        \
     /Integration\   ← Some, medium speed
    /______________\
   /                \
  /   Unit Tests     \  ← Many, fast, focused
 /____________________\
```

## Component Testing

### Basic Component Test
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    
    render(<Button onClick={handleClick}>Click</Button>);
    
    await user.click(screen.getByRole('button'));
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>);
    
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Testing with Context
```tsx
function renderWithProviders(
  ui: React.ReactElement,
  options: { user?: User; theme?: Theme } = {}
) {
  const { user = mockUser, theme = 'light' } = options;
  
  return render(
    <UserContext.Provider value={user}>
      <ThemeContext.Provider value={theme}>
        {ui}
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
}

it('shows user name', () => {
  renderWithProviders(<UserProfile />, { user: { name: 'John' } });
  
  expect(screen.getByText('John')).toBeInTheDocument();
});
```

### Testing with Router
```tsx
import { MemoryRouter } from 'react-router-dom';

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

it('navigates to details page', async () => {
  const user = userEvent.setup();
  
  renderWithRouter(<App />, { route: '/alerts' });
  
  await user.click(screen.getByText('View Details'));
  
  expect(screen.getByRole('heading', { name: /alert details/i })).toBeInTheDocument();
});
```

## Hook Testing

### Testing Custom Hooks
```tsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { result } = renderHook(() => useCounter());
    
    expect(result.current.count).toBe(0);
  });

  it('initializes with provided value', () => {
    const { result } = renderHook(() => useCounter(10));
    
    expect(result.current.count).toBe(10);
  });

  it('increments count', () => {
    const { result } = renderHook(() => useCounter());
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.count).toBe(1);
  });
});
```

### Testing Async Hooks
```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useAlerts } from './useAlerts';

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
});
```

## API Mocking with MSW

### Setup
```tsx
// src/mocks/handlers.ts
import { rest } from 'msw';

export const handlers = [
  rest.get('/api/alerts', (req, res, ctx) => {
    return res(
      ctx.json({
        data: [
          { id: '1', title: 'Alert 1', severity: 'high' },
          { id: '2', title: 'Alert 2', severity: 'low' },
        ],
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
```

### Override Handlers in Tests
```tsx
import { server } from '@/mocks/server';
import { rest } from 'msw';

it('shows error state on API failure', async () => {
  server.use(
    rest.get('/api/alerts', (req, res, ctx) => {
      return res(ctx.status(500), ctx.json({ message: 'Server error' }));
    })
  );

  render(<AlertsList />);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/error/i);
  });
});
```

## Query Priority

Use queries in this order (most accessible first):

```tsx
// 1. Accessible queries (preferred)
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText('Email');
screen.getByPlaceholderText('Search...');
screen.getByText('Welcome');

// 2. Semantic queries
screen.getByAltText('Profile picture');
screen.getByTitle('Close');

// 3. Test IDs (last resort)
screen.getByTestId('complex-chart');
```

## User Event Patterns

```tsx
const user = userEvent.setup();

// Click
await user.click(element);

// Type
await user.type(input, 'Hello');

// Clear and type
await user.clear(input);
await user.type(input, 'New value');

// Select option
await user.selectOptions(select, 'option-value');

// Hover
await user.hover(element);

// Keyboard
await user.tab();
await user.keyboard('{Enter}');
await user.keyboard('{ArrowDown}');

// Upload file
const file = new File(['content'], 'test.txt', { type: 'text/plain' });
await user.upload(input, file);
```

## Testing Patterns

### Arrange-Act-Assert
```tsx
it('adds item to cart', async () => {
  // Arrange
  const user = userEvent.setup();
  render(<Product item={mockProduct} />);
  
  // Act
  await user.click(screen.getByRole('button', { name: /add to cart/i }));
  
  // Assert
  expect(screen.getByText(/added to cart/i)).toBeInTheDocument();
});
```

### Testing Loading States
```tsx
it('shows loading skeleton while fetching', () => {
  render(<DataTable />);
  
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
});

it('shows data after loading', async () => {
  render(<DataTable />);
  
  await waitFor(() => {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  
  expect(screen.getAllByRole('row')).toHaveLength(5);
});
```

### Testing Form Validation
```tsx
it('shows validation errors', async () => {
  const user = userEvent.setup();
  render(<LoginForm />);
  
  // Submit empty form
  await user.click(screen.getByRole('button', { name: /submit/i }));
  
  expect(screen.getByText(/email is required/i)).toBeInTheDocument();
  expect(screen.getByText(/password is required/i)).toBeInTheDocument();
});
```

## What NOT to Test

- Implementation details (internal state names)
- Third-party library internals
- Styling (unless business logic)
- Static content that never changes

## Test File Organization

```
src/
├── components/
│   └── Button/
│       ├── Button.tsx
│       └── __tests__/
│           └── Button.test.tsx
├── hooks/
│   ├── useAlerts.ts
│   └── __tests__/
│       └── useAlerts.test.ts
└── lib/
    ├── format.ts
    └── __tests__/
        └── format.test.ts
```

## References

- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [MSW Documentation](https://mswjs.io/)
- [09-tests.instructions.md](../../instructions/09-tests.instructions.md)
