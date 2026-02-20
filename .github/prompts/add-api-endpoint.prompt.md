---
agent: agent
description: 'Add a new API endpoint to the BFF'
---

# Add API Endpoint

Add a new API endpoint to the BFF service.

## Steps
1. Define types in `bff/src/types.ts`
2. Implement service logic in appropriate `*.service.ts` file
3. Add route handler in `bff/src/index.ts`
4. Create corresponding API client in `src/lib/`

## Follow Patterns
- See `bff/src/service.ts` for service implementation
- See `src/lib/alertsApiClient.ts` for client patterns

## Implementation Checklist
- [ ] Add request/response types to `bff/src/types.ts`
- [ ] Implement service function in `*.service.ts`
- [ ] Add route handler in `bff/src/index.ts`
- [ ] Create API client function in `src/lib/`
- [ ] Add error handling
- [ ] Test endpoint functionality

## Error Handling
- Return typed error responses
- Use appropriate HTTP status codes
- Log errors with context
