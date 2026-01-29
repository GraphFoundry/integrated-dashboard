---
agent: agent
description: 'Create a new dashboard widget component'
---

# Create Dashboard Widget

Create a new dashboard widget component with the following specifications:

## Requirements
1. Create a new widget in `src/widgets/{name}/`
2. Include the main component file
3. Add TypeScript types
4. Export from an `index.ts` barrel file
5. Follow patterns in existing widgets (see `src/widgets/alerts/`)

## Widget Structure
- `{Name}Widget.tsx` - Main component
- `types.ts` - TypeScript interfaces
- `use{Name}.tsx` - Custom hook for data fetching
- `index.ts` - Barrel exports

## Styling
- Use Tailwind CSS classes
- Follow the KPI card patterns in `src/components/layout/KPIStatCard.tsx`
- Ensure responsive design

## Implementation Checklist
- [ ] Create widget directory structure
- [ ] Define TypeScript interfaces in `types.ts`
- [ ] Implement custom hook for data fetching
- [ ] Build main widget component
- [ ] Add loading and error states
- [ ] Export from `index.ts`
- [ ] Test component renders correctly
