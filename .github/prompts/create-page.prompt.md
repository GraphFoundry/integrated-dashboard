---
agent: agent
description: Create a new page component with proper routing and layout
---

# Create Page

Create a new page component with routing integration and proper layout.

## Input Required

- **Page Name**: The feature/section name (e.g., `alerts`, `metrics`, `overview`)
- **Route Path**: URL path for the page (e.g., `/alerts`, `/metrics/:id`)
- **Page Title**: Display title for the page header

## Process

1. **Create Page Directory**
   ```
   src/pages/{pageName}/
   ├── {PageName}.tsx      # Main page component
   ├── components/          # Page-specific components
   └── hooks/              # Page-specific hooks (if needed)
   ```

2. **Generate Page Component**
   Following `.github/instructions/06-pages.instructions.md`:
   - Orchestration only (coordinate child components)
   - Use PageHeader for consistent header
   - Use Section for content areas
   - Handle loading/error/empty states

3. **Add Route Configuration**
   Update `src/app/routes.tsx` with lazy-loaded route

4. **Add Navigation Entry** (if needed)
   Update `src/app/layout/Sidebar.tsx` with navigation link

## Page Template

```tsx
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Section } from '@/components/layout/Section';
import { EmptyState } from '@/components/layout/EmptyState';
// Import page-specific hooks
// Import page-specific components

export function ${PageName}Page() {
  // Page-level state
  const [filters, setFilters] = useState({});
  
  // Data fetching
  const { data, isLoading, error, refetch } = use${PageName}Data(filters);
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="${Page Title}"
        description="Brief description of this page"
        actions={
          <button onClick={refetch} className="btn-primary">
            Refresh
          </button>
        }
      />
      
      <Section>
        {isLoading ? (
          <${PageName}Skeleton />
        ) : error ? (
          <ErrorMessage error={error} onRetry={refetch} />
        ) : !data?.length ? (
          <EmptyState
            title="No data"
            description="No data matches your criteria"
          />
        ) : (
          <${PageName}Content data={data} />
        )}
      </Section>
    </div>
  );
}

export default ${PageName}Page;
```

## Route Configuration

```tsx
// In src/app/routes.tsx
const ${PageName}Page = lazy(() => import('@/pages/${pageName}/${PageName}'));

// Add to Routes
<Route path="${routePath}" element={<${PageName}Page />} />
```

## Checklist

- [ ] Page directory created
- [ ] Main page component created
- [ ] Route added to routes.tsx
- [ ] Navigation link added (if applicable)
- [ ] PageHeader used with title and actions
- [ ] Loading/error/empty states handled
- [ ] Lazy loading configured
