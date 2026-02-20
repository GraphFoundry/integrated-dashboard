---
name: API Client Development
description: 'API client development standards'
applyTo: 'src/lib/*ApiClient.ts, src/lib/*Client.ts'
---

# API Client Standards

## Structure
- Export typed functions for each endpoint
- Use the base `httpClient.ts` for requests
- Define response types explicitly
- Handle errors with consistent patterns

## Patterns
- Return typed promises with response data
- Include request/response logging in development
- Support cancellation for long-running requests
