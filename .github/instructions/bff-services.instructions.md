---
name: BFF Services
description: 'Backend for Frontend service standards'
applyTo: 'bff/src/**/*.ts'
---

# BFF Service Standards

## Structure
- Export service functions, not classes
- Use dependency injection for external services
- Define types in `types.ts`

## Error Handling
- Use typed error responses
- Log errors with context
- Return appropriate HTTP status codes
