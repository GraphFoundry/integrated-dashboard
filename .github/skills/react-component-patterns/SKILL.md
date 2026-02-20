---
name: React Component Patterns
description: Advanced React component patterns for building maintainable, performant dashboard applications
---

# React Component Patterns

Advanced React component patterns for building maintainable, performant dashboard applications.

## When to Use This Skill

- Deciding between component patterns (compound, render props, controlled)
- Implementing complex component interactions
- Building reusable component libraries
- Optimizing component architecture

## When NOT to Use This Skill

- Simple one-off components (just use basic function components)
- Learning React basics (this assumes professional-level experience)
- When premature abstraction would add complexity
- For components used only once (avoid over-engineering)

## Component Patterns

### 1. Compound Components

Use when building components that work together with shared state:

```tsx
// Parent manages state, children consume via context
const TabContext = createContext<TabContextValue | null>(null);

function Tabs({ children, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabContext.Provider>
  );
}

function TabList({ children }: { children: React.ReactNode }) {
  return <div role="tablist" className="flex gap-2">{children}</div>;
}

function Tab({ id, children }: TabProps) {
  const { activeTab, setActiveTab } = useTabContext();
  return (
    <button
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => setActiveTab(id)}
      className={cn('tab', activeTab === id && 'tab-active')}
    >
      {children}
    </button>
  );
}

function TabPanel({ id, children }: TabPanelProps) {
  const { activeTab } = useTabContext();
  if (activeTab !== id) return null;
  return <div role="tabpanel">{children}</div>;
}

// Usage
<Tabs defaultTab="overview">
  <TabList>
    <Tab id="overview">Overview</Tab>
    <Tab id="details">Details</Tab>
  </TabList>
  <TabPanel id="overview">Overview content</TabPanel>
  <TabPanel id="details">Details content</TabPanel>
</Tabs>
```

### 2. Render Props

Use when children need to control what gets rendered:

```tsx
interface DataLoaderProps<T> {
  load: () => Promise<T>;
  children: (state: AsyncState<T>) => React.ReactNode;
}

function DataLoader<T>({ load, children }: DataLoaderProps<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  
  useEffect(() => {
    load()
      .then(data => setState({ status: 'success', data }))
      .catch(error => setState({ status: 'error', error }));
  }, [load]);
  
  return <>{children(state)}</>;
}

// Usage
<DataLoader load={fetchAlerts}>
  {(state) => {
    if (state.status === 'loading') return <Skeleton />;
    if (state.status === 'error') return <Error error={state.error} />;
    return <AlertList alerts={state.data} />;
  }}
</DataLoader>
```

### 3. Controlled vs Uncontrolled

Use controlled for forms that need external state:

```tsx
// Controlled - parent owns state
interface ControlledInputProps {
  value: string;
  onChange: (value: string) => void;
}

function ControlledInput({ value, onChange }: ControlledInputProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Uncontrolled - component owns state with optional default
interface UncontrolledInputProps {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

function UncontrolledInput({ defaultValue, onValueChange }: UncontrolledInputProps) {
  const [value, setValue] = useState(defaultValue ?? '');
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onValueChange?.(e.target.value);
  };
  
  return <input value={value} onChange={handleChange} />;
}
```

### 4. Polymorphic Components

Use for components that can render as different elements:

```tsx
type PolymorphicProps<E extends React.ElementType> = {
  as?: E;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<E>, 'as' | 'children'>;

function Text<E extends React.ElementType = 'span'>({
  as,
  children,
  className,
  ...props
}: PolymorphicProps<E>) {
  const Component = as || 'span';
  return (
    <Component className={cn('text-base', className)} {...props}>
      {children}
    </Component>
  );
}

// Usage
<Text>Default span</Text>
<Text as="p">Paragraph</Text>
<Text as="h1" className="text-2xl">Heading</Text>
<Text as="a" href="/link">Link</Text>
```

### 5. Slot Pattern

Use for highly customizable components:

```tsx
interface CardSlots {
  header?: React.ReactNode;
  body?: React.ReactNode;
  footer?: React.ReactNode;
}

function Card({ header, body, footer, children }: CardSlots & { children?: React.ReactNode }) {
  return (
    <div className="card">
      {header && <div className="card-header">{header}</div>}
      <div className="card-body">{body || children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

// Usage
<Card
  header={<h2>Title</h2>}
  footer={<Button>Save</Button>}
>
  Card content here
</Card>
```

## Composition Guidelines

| Pattern | Use When |
|---------|----------|
| Compound | Components work together (Tabs, Accordion, Menu) |
| Render Props | Consumer controls rendering |
| Controlled | Parent needs to manage state |
| Polymorphic | Component renders as different elements |
| Slots | Many customizable sections |

## Anti-Patterns to Avoid (BANNED)

### ❌ Prop Drilling Beyond 2 Levels
```tsx
// FORBIDDEN: Passing through many levels
<Grandparent user={user}>
  <Parent user={user}>
    <Child user={user}>
      <GrandChild user={user} />
    </Child>
  </Parent>
</Grandparent>

// REQUIRED: Use context or composition
<UserProvider user={user}>
  <Grandparent>
    <Parent>
      <Child>
        <GrandChild /> {/* Uses useUser() */}
      </Child>
    </Parent>
  </Grandparent>
</UserProvider>
```

### ❌ God Components
```tsx
// FORBIDDEN: One component does everything
function Dashboard() {
  // 500+ lines - NEVER
  // Fetch data, transform, render everything
}

// REQUIRED: Compose smaller components
function Dashboard() {
  return (
    <>
      <DashboardHeader />
      <DashboardMetrics />
      <DashboardAlerts />
      <DashboardActivity />
    </>
  );
}
```

### ❌ useEffect for Derived State
```tsx
// FORBIDDEN
const [filtered, setFiltered] = useState([]);
useEffect(() => {
  setFiltered(items.filter(predicate));
}, [items]);

// REQUIRED
const filtered = useMemo(() => items.filter(predicate), [items]);
```

### ❌ Components Inside Components
```tsx
// FORBIDDEN - Destroys state on every render
function Parent() {
  const Child = () => <div />;  // NEVER
  return <Child />;
}

// REQUIRED - Module-level definitions
const Child = () => <div />;
function Parent() {
  return <Child />;
}
```

## References

- [React Documentation: Composition](https://react.dev/learn/passing-props-to-a-component)
- [02-components.instructions.md](../../instructions/02-components.instructions.md)
