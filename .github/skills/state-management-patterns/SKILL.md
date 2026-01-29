---
name: State Management Patterns
description: State management patterns for React dashboard applications
---

# State Management Patterns

State management patterns for React dashboard applications.

## When to Use This Skill

- Deciding where to put state
- Choosing between useState, useReducer, Context
- Managing complex form state
- Handling server state
- Optimizing state updates

## State Location Decision Tree

```
Is it used by only one component?
  ├─ Yes → useState in that component
  └─ No → Is it needed by siblings?
            ├─ Yes → Lift to common parent
            └─ No → Is it needed deeply nested?
                      ├─ Yes → Use Context
                      └─ No → Prop drilling is fine
```

## Local State Patterns

### Simple State
```tsx
const [isOpen, setIsOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [selectedId, setSelectedId] = useState<string | null>(null);
```

### Complex Object State
```tsx
// For related values that change together
interface FormState {
  name: string;
  email: string;
  message: string;
}

const [form, setForm] = useState<FormState>({
  name: '',
  email: '',
  message: '',
});

// Update single field
const updateField = (field: keyof FormState, value: string) => {
  setForm(prev => ({ ...prev, [field]: value }));
};
```

### Reducer for Complex Logic
```tsx
type Action =
  | { type: 'SET_LOADING' }
  | { type: 'SET_DATA'; payload: Data[] }
  | { type: 'SET_ERROR'; payload: Error }
  | { type: 'ADD_ITEM'; payload: Data }
  | { type: 'REMOVE_ITEM'; payload: string };

interface State {
  data: Data[];
  isLoading: boolean;
  error: Error | null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: true, error: null };
    case 'SET_DATA':
      return { ...state, data: action.payload, isLoading: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'ADD_ITEM':
      return { ...state, data: [...state.data, action.payload] };
    case 'REMOVE_ITEM':
      return { 
        ...state, 
        data: state.data.filter(item => item.id !== action.payload) 
      };
    default:
      return state;
  }
}

function Component() {
  const [state, dispatch] = useReducer(reducer, initialState);
  
  const addItem = (item: Data) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
  };
}
```

## Context Patterns

### Creating Context
```tsx
// 1. Define types
interface DashboardContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

// 2. Create context with null default
const DashboardContext = createContext<DashboardContextValue | null>(null);

// 3. Create hook with safety check
function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return context;
}

// 4. Create provider
function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  
  // Memoize value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    dateRange,
    setDateRange,
    filters,
    setFilters,
  }), [dateRange, filters]);
  
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
```

### Split Context for Performance
```tsx
// ❌ Bad: All consumers re-render on any change
const AppContext = createContext({ user, theme, settings });

// ✅ Good: Separate by update frequency
const UserContext = createContext<User | null>(null);
const ThemeContext = createContext<Theme>('light');
const SettingsContext = createContext<Settings>(defaultSettings);

// Compose providers
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </ThemeProvider>
    </UserProvider>
  );
}
```

## Derived State

### Compute Instead of Store
```tsx
// ❌ Bad: Synced state
const [items, setItems] = useState<Item[]>([]);
const [activeItems, setActiveItems] = useState<Item[]>([]);

useEffect(() => {
  setActiveItems(items.filter(i => i.isActive));
}, [items]);

// ✅ Good: Computed state
const [items, setItems] = useState<Item[]>([]);
const activeItems = useMemo(
  () => items.filter(i => i.isActive),
  [items]
);
```

### Multiple Derived Values
```tsx
function useItemStats(items: Item[]) {
  return useMemo(() => ({
    total: items.length,
    active: items.filter(i => i.isActive).length,
    inactive: items.filter(i => !i.isActive).length,
    averageValue: items.reduce((sum, i) => sum + i.value, 0) / items.length || 0,
  }), [items]);
}
```

## Server State

### Data Fetching Pattern
```tsx
interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

function useData<T>(fetcher: () => Promise<T>): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await fetcher();
      setState({ data, isLoading: false, error: null });
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false, error: error as Error }));
    }
  }, [fetcher]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}
```

## Form State

### Controlled Form
```tsx
function useForm<T extends Record<string, unknown>>(initialValues: T) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const handleChange = <K extends keyof T>(field: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  };

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setErrors,
    reset,
  };
}
```

## URL State

### Sync with URL
```tsx
import { useSearchParams } from 'react-router-dom';

function useFiltersFromUrl() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filters = useMemo(() => ({
    status: searchParams.get('status') || undefined,
    severity: searchParams.get('severity') || undefined,
    search: searchParams.get('q') || undefined,
  }), [searchParams]);
  
  const setFilter = (key: string, value: string | null) => {
    setSearchParams(prev => {
      if (value) {
        prev.set(key, value);
      } else {
        prev.delete(key);
      }
      return prev;
    });
  };
  
  return { filters, setFilter };
}
```

## Anti-Patterns

### ❌ State for Derived Values
```tsx
// Bad
const [items, setItems] = useState([]);
const [count, setCount] = useState(0);
useEffect(() => setCount(items.length), [items]);

// Good
const count = items.length;
```

### ❌ Over-using Context
```tsx
// Bad: Everything in context
<AppContext.Provider value={{ user, theme, modal, toast, alerts, ... }}>

// Good: Local state where possible, context only when truly shared
```

## References

- [React State Management](https://react.dev/learn/managing-state)
- [04-state-management.instructions.md](../../instructions/04-state-management.instructions.md)
