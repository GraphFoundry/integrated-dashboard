---
agent: agent
description: 'Create a new chart component using Recharts'
---

# Create Chart Component

Create a new chart component using Recharts for data visualization.

## Requirements
1. Create component in `src/components/charts/`
2. Use TypeScript for props and data types
3. Leverage Recharts library
4. Follow existing chart patterns

## Chart Component Structure
- Props interface with data, dimensions, colors
- Responsive container wrapper
- Proper axis configuration
- Tooltip and legend (if applicable)
- Loading and empty states

## Follow Patterns
- See `src/components/charts/TimeSeriesLineChart.tsx` for line chart patterns
- See `src/components/charts/LatencyMultiLineChart.tsx` for multi-series patterns

## Styling
- Use Tailwind for container and wrapper styles
- Use color tokens from `tailwind.config.ts` for chart colors
- Ensure responsive behavior with ResponsiveContainer

## Implementation Checklist
- [ ] Define TypeScript interfaces for props and data
- [ ] Implement chart component with Recharts
- [ ] Add responsive wrapper
- [ ] Configure axes, tooltip, legend
- [ ] Handle loading state
- [ ] Handle empty data state
- [ ] Apply consistent color scheme
- [ ] Export component
