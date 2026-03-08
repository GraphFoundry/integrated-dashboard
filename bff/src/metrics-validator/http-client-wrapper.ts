type ReadOnlyHttpRequest = {
  url: string
  method?: string
  signal?: AbortSignal
}

type HttpRequestExecutor<T> = (request: ReadOnlyHttpRequest) => Promise<T>

const READ_ONLY_HTTP_METHOD = 'GET'
const MUTATING_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function normalizeHttpMethod(method: string | undefined): string {
  if (typeof method !== 'string' || method.trim().length === 0) {
    return READ_ONLY_HTTP_METHOD
  }

  return method.trim().toUpperCase()
}

function parseAbsoluteHttpUrl(value: string, context: string): URL {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`${context} must use http or https protocol`)
    }
    return parsed
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${context} is invalid: ${error.message}`)
    }
    throw new Error(`${context} is invalid`)
  }
}

function normalizeEndpointKey(url: URL): string {
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
  return `${url.origin}${normalizedPath}`
}

function assertReadOnlyHttpRequest(
  request: ReadOnlyHttpRequest,
  configuredEndpoints: ReadonlyArray<string>
): ReadOnlyHttpRequest {
  if (configuredEndpoints.length === 0) {
    throw new Error(
      'Configured endpoint allowlist cannot be empty for read-only HTTP execution'
    )
  }

  const normalizedMethod = normalizeHttpMethod(request.method)
  if (normalizedMethod !== READ_ONLY_HTTP_METHOD) {
    if (MUTATING_HTTP_METHODS.has(normalizedMethod)) {
      throw new Error(
        `Mutating HTTP method "${normalizedMethod}" is blocked in read-only mode; only GET requests are permitted`
      )
    }

    throw new Error(
      `HTTP method "${normalizedMethod}" is not allowed in read-only mode; only GET requests are permitted`
    )
  }

  const requestUrl = parseAbsoluteHttpUrl(request.url, 'HTTP request URL')
  const requestEndpointKey = normalizeEndpointKey(requestUrl)
  const allowlistedEndpointKeys = new Set(
    configuredEndpoints.map((endpoint) =>
      normalizeEndpointKey(
        parseAbsoluteHttpUrl(endpoint, 'Configured endpoint allowlist entry')
      )
    )
  )

  if (!allowlistedEndpointKeys.has(requestEndpointKey)) {
    throw new Error(
      `HTTP GET request to "${requestEndpointKey}" is not in configured endpoint allowlist`
    )
  }

  return {
    ...request,
    method: READ_ONLY_HTTP_METHOD,
    url: requestUrl.toString()
  }
}

function createReadOnlyHttpClientWrapper<T>(
  executeRequest: HttpRequestExecutor<T>,
  configuredEndpoints: ReadonlyArray<string>
): HttpRequestExecutor<T> {
  return async (request: ReadOnlyHttpRequest): Promise<T> => {
    const validatedRequest = assertReadOnlyHttpRequest(
      request,
      configuredEndpoints
    )
    return executeRequest(validatedRequest)
  }
}

export {
  assertReadOnlyHttpRequest,
  createReadOnlyHttpClientWrapper,
  type HttpRequestExecutor,
  type ReadOnlyHttpRequest
}
