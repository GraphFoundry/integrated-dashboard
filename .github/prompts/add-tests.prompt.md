---
agent: agent
description: Add comprehensive tests for components, hooks, or utilities
---

# Add Tests

Generate comprehensive tests for the specified code following project testing standards.

## Input Required

- **Target**: File or component to test
- **Test Type**: `unit` | `integration` | `e2e`
- **Focus Areas**: Specific behaviors to test

## Test Location

```
For: src/components/common/StatusBadge.tsx
Create: src/components/common/__tests__/StatusBadge.test.tsx

For: src/hooks/useAlerts.ts
Create: src/hooks/__tests__/useAlerts.test.ts

For: src/lib/format.ts
Create: src/lib/__tests__/format.test.ts
```

## Component Test Template

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ${ComponentName} } from '../${ComponentName}';

describe('${ComponentName}', () => {
  const defaultProps = {
    // Required props with sensible defaults
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with required props', () => {
      render(<${ComponentName} {...defaultProps} />);
      
      expect(screen.getByRole('...')).toBeInTheDocument();
    });

    it('renders optional content when provided', () => {
      render(<${ComponentName} {...defaultProps} optional="value" />);
      
      expect(screen.getByText(/value/i)).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls handler when clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      
      render(<${ComponentName} {...defaultProps} onClick={onClick} />);
      
      await user.click(screen.getByRole('button'));
      
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('states', () => {
    it('shows loading state', () => {
      render(<${ComponentName} {...defaultProps} isLoading />);
      
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('shows error state', () => {
      render(<${ComponentName} {...defaultProps} error="Error message" />);
      
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has accessible name', () => {
      render(<${ComponentName} {...defaultProps} />);
      
      expect(screen.getByRole('...', { name: /.../ })).toBeInTheDocument();
    });
  });
});
```

## Hook Test Template

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { use${HookName} } from '../use${HookName}';

describe('use${HookName}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => use${HookName}());
    
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('returns data after loading', async () => {
    const { result } = renderHook(() => use${HookName}());
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(result.current.data).toBeDefined();
    expect(result.current.error).toBeNull();
  });

  it('handles errors', async () => {
    // Setup error condition
    
    const { result } = renderHook(() => use${HookName}());
    
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });
});
```

## Query Priority

Use in this order (most accessible first):
1. `getByRole` - buttons, headings, links
2. `getByLabelText` - form inputs
3. `getByPlaceholderText` - inputs
4. `getByText` - non-interactive text
5. `getByTestId` - last resort only

## Run Tests

```bash
# Run tests for specific file
npm test -- ${testFile}

# Run with coverage
npm test -- --coverage ${testFile}
```

## Checklist

- [ ] Test file created in `__tests__/` directory
- [ ] All rendering scenarios covered
- [ ] User interactions tested with `userEvent`
- [ ] Loading/error/empty states tested
- [ ] Accessible queries used (getByRole, getByLabelText)
- [ ] Mocks cleaned up in beforeEach
- [ ] Tests pass independently
