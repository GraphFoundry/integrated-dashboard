---
name: State Management
description: 'State management patterns for React dashboard applications'
applyTo: 'src/**/*.tsx, src/hooks/**/*.ts'
---

# State Management Standards

## Core Principles

1. **Local State First** - Use useState until you need to share
2. **Lift State Minimally** - Only as high as necessary
3. **Server State Separate** - Use dedicated patterns for API data
4. **Avoid Prop Drilling** - Use context for deeply nested data

## State Categories

### 1. Local Component State
```typescript
// Simple UI state
const [isOpen, setIsOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [selectedTab, setSelectedTab] = useState<TabId>('overview');
```

### 2. Lifted State (Parent Component)
```typescript
// Parent manages shared state
function Dashboard() {
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  
  return (
    <>
      <MetricsList onSelect={setSelectedMetric} />
      <MetricDetails metric={selectedMetric} />
    </>
  );
}
```

### 3. Context State (Global/Shared)
```typescript
// Context for widely shared state
interface DashboardContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  refreshInterval: number;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboardContext must be used within DashboardProvider');
  }
  return context;
}
```

### 4. Server State (API Data)
```typescript
// Custom hook for server state
function useAlerts(filters: AlertFilters) {
  const [data, setData] = useState<Alert[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(() => {
    // Refetch logic
  }, [filters]);

  useEffect(() => {
    // Fetch logic
  }, [filters]);

  return { data, isLoading, error, refetch };
}
```

## Context Patterns

### Create Focused Contexts
```typescript
// ❌ Bad: Mega context
const AppContext = createContext({
  user, theme, alerts, settings, metrics, filters, ...
});

// ✅ Good: Focused contexts
const UserContext = createContext<User | null>(null);
const ThemeContext = createContext<Theme>('light');
const AlertsContext = createContext<AlertsContextValue | null>(null);
```

### Context with Reducer for Complex State
```typescript
// For complex state with multiple actions
interface DashboardState {
  dateRange: DateRange;
  selectedServices: string[];
  viewMode: 'grid' | 'list';
}

type DashboardAction =
  | { type: 'SET_DATE_RANGE'; payload: DateRange }
  | { type: 'TOGGLE_SERVICE'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: 'grid' | 'list' };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.payload };
    case 'TOGGLE_SERVICE':
      return {
        ...state,
        selectedServices: state.selectedServices.includes(action.payload)
          ? state.selectedServices.filter(s => s !== action.payload)
          : [...state.selectedServices, action.payload],
      };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    default:
      return state;
  }
}

// Provider with reducer
export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
```

## Best Practices

### Derive State Instead of Syncing
```typescript
// ❌ Bad: Synced state
const [items, setItems] = useState<Item[]>([]);
const [filteredItems, setFilteredItems] = useState<Item[]>([]);

useEffect(() => {
  setFilteredItems(items.filter(i => i.active));
}, [items]);

// ✅ Good: Derived state
const [items, setItems] = useState<Item[]>([]);
const filteredItems = useMemo(
  () => items.filter(i => i.active),
  [items]
);
```

### Use Controlled Components
```typescript
// ✅ Good: Parent controls state
function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Parent
const [search, setSearch] = useState('');
<SearchInput value={search} onChange={setSearch} />
```

### Batch Updates with Functional Updates
```typescript
// ✅ Good: Functional updates for state based on previous
const [count, setCount] = useState(0);

function incrementTwice() {
  setCount(c => c + 1);
  setCount(c => c + 1); // Works correctly
}
```

### Reset State with Key
```typescript
// ✅ Good: Reset component state by changing key
<FilterPanel key={activeTab} initialFilters={defaultFilters} />
```

## State Colocation Guidelines

| State Type | Location | Example |
|------------|----------|---------|
| Form input values | Component | `useState` in form component |
| UI state (open/closed) | Component | `useState` in parent |
| Selected items | Nearest common ancestor | Lift to shared parent |
| User preferences | Context | `ThemeContext` |
| Server data | Custom hook | `useAlerts()` |
| URL state | Router | Query params |

## References

- [Components Instructions](./02-components.instructions.md)
- [Hooks Instructions](./03-hooks.instructions.md)
