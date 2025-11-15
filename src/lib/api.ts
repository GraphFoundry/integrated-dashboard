import type { FailureResponse, ScaleResponse, FailureScenario, ScaleScenario } from './types';

// In dev mode, use /api proxy (Vite forwards to localhost:7000)
// In production, use VITE_API_BASE_URL env var or fallback to localhost:7000
const API_BASE_URL = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:7000');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  return response.json();
}

export async function simulateFailure(
  scenario: Omit<FailureScenario, 'type'>
): Promise<FailureResponse> {
  const url = `${API_BASE_URL}/simulate/failure?trace=true`;
  return fetchJson<FailureResponse>(url, {
    method: 'POST',
    body: JSON.stringify({
      serviceId: scenario.serviceId,
      maxDepth: scenario.maxDepth,
    }),
  });
}

export async function simulateScale(
  scenario: Omit<ScaleScenario, 'type'>
): Promise<ScaleResponse> {
  const url = `${API_BASE_URL}/simulate/scale?trace=true`;
  return fetchJson<ScaleResponse>(url, {
    method: 'POST',
    body: JSON.stringify({
      serviceId: scenario.serviceId,
      currentPods: scenario.currentPods,
      newPods: scenario.newPods,
      latencyMetric: scenario.latencyMetric,
      maxDepth: scenario.maxDepth,
    }),
  });
}

export async function healthCheck(): Promise<{ status: string }> {
  const url = `${API_BASE_URL}/health`;
  return fetchJson<{ status: string }>(url);
}
