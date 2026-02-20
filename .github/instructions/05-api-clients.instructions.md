---
name: API Clients
description: 'API client implementation standards'
applyTo: 'src/lib/*ApiClient.ts, src/lib/*Client.ts, src/lib/api.ts'
---

# API Client Standards

## Core Principles

1. **Type Safety** - Full TypeScript coverage for requests and responses
2. **Error Handling** - Consistent error patterns
3. **Cancellation** - Support for request cancellation
4. **Centralized** - Single HTTP client configuration

## Base HTTP Client

```typescript
// src/lib/httpClient.ts
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class HttpClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(endpoint: string, params?: RequestOptions['params']): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...init } = options;
    const url = this.buildUrl(endpoint, params);

    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(response.status, error.message || response.statusText);
    }

    return response.json();
  }

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const httpClient = new HttpClient(BASE_URL);
```

## API Error Handling

```typescript
// src/lib/errors.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}
```

## Domain API Client Pattern

```typescript
// src/lib/alertsApiClient.ts
import { httpClient } from './httpClient';
import type { Alert, AlertFilters, AlertsResponse, CreateAlertInput } from './types';

export const alertsApi = {
  /**
   * Fetch alerts with optional filters
   */
  async getAlerts(
    filters?: AlertFilters,
    signal?: AbortSignal
  ): Promise<AlertsResponse> {
    return httpClient.get<AlertsResponse>('/alerts', {
      params: filters,
      signal,
    });
  },

  /**
   * Fetch a single alert by ID
   */
  async getAlert(id: string, signal?: AbortSignal): Promise<Alert> {
    return httpClient.get<Alert>(`/alerts/${id}`, { signal });
  },

  /**
   * Create a new alert
   */
  async createAlert(input: CreateAlertInput): Promise<Alert> {
    return httpClient.post<Alert>('/alerts', input);
  },

  /**
   * Update an existing alert
   */
  async updateAlert(id: string, input: Partial<Alert>): Promise<Alert> {
    return httpClient.put<Alert>(`/alerts/${id}`, input);
  },

  /**
   * Delete an alert
   */
  async deleteAlert(id: string): Promise<void> {
    return httpClient.delete(`/alerts/${id}`);
  },

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id: string): Promise<Alert> {
    return httpClient.post<Alert>(`/alerts/${id}/acknowledge`);
  },
};
```

## Type Definitions

```typescript
// src/lib/types.ts (API types section)

// Request types
export interface AlertFilters {
  severity?: AlertSeverity;
  status?: AlertStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAlertInput {
  title: string;
  message: string;
  severity: AlertSeverity;
  source: string;
}

// Response types
export interface AlertsResponse {
  data: Alert[];
  pagination: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

## Usage in Hooks

```typescript
// src/hooks/useAlerts.ts
import { useState, useEffect, useCallback } from 'react';
import { alertsApi } from '@/lib/alertsApiClient';
import type { Alert, AlertFilters } from '@/lib/types';

export function useAlerts(filters?: AlertFilters) {
  const [data, setData] = useState<Alert[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const response = await alertsApi.getAlerts(filters, signal);
      setData(response.data);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAlerts(controller.signal);
    return () => controller.abort();
  }, [fetchAlerts]);

  const refetch = useCallback(() => fetchAlerts(), [fetchAlerts]);

  return { data, isLoading, error, refetch };
}
```

## Best Practices

### Always Support Cancellation
```typescript
// ✅ Good: Accepts AbortSignal
async getAlerts(filters?: AlertFilters, signal?: AbortSignal): Promise<AlertsResponse>

// In component
useEffect(() => {
  const controller = new AbortController();
  fetchData(controller.signal);
  return () => controller.abort();
}, []);
```

### Use Consistent Naming
```typescript
// API methods
getAlerts()     // GET list
getAlert(id)    // GET single
createAlert()   // POST
updateAlert()   // PUT
deleteAlert()   // DELETE
```

### Export as Object, Not Class
```typescript
// ✅ Good: Object with methods (tree-shakeable)
export const alertsApi = {
  getAlerts: async () => { },
  getAlert: async (id: string) => { },
};

// ❌ Avoid: Class instance
export default new AlertsApiClient();
```

## File Organization

```
src/lib/
├── httpClient.ts      # Base HTTP client
├── errors.ts          # Error classes
├── types.ts           # All type definitions
├── alertsApiClient.ts # Alerts API
├── metricsApiClient.ts # Metrics API
└── index.ts           # Barrel export
```

## References

- [Types Instructions](./01-types.instructions.md)
- [Hooks Instructions](./03-hooks.instructions.md)
