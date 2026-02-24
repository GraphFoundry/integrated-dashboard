import { useEffect, useState, useCallback, useRef } from 'react'
import { checkK8sHealth, type K8sHealthResult } from '@/lib/api/drills'

const POLL_INTERVAL_MS = 15_000

export interface K8sHealthState {
  /** `null` while the first probe is in flight. */
  status: K8sHealthResult | null
  /** True during the initial probe only. */
  isLoading: boolean
  /** Force an immediate re-check. */
  recheck: () => void
}

/**
 * Polls `GET /drills/k8s-health` on mount and every 15 s thereafter.
 * Automatically pauses polling when the cluster is reachable (reduces noise),
 * and resumes aggressive polling when it goes down.
 */
export function useK8sHealth(): K8sHealthState {
  const [status, setStatus] = useState<K8sHealthResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const probe = useCallback(async () => {
    try {
      const result = await checkK8sHealth()
      if (mountedRef.current) {
        setStatus(result)
        setIsLoading(false)
      }
    } catch {
      if (mountedRef.current) {
        setStatus({
          reachable: false,
          error: 'Health probe failed',
          hint: 'Ensure the Analysis Engine is running.',
        })
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Initial probe
    void probe()

    // Poll on an interval
    intervalRef.current = setInterval(() => {
      void probe()
    }, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [probe])

  const recheck = useCallback(() => {
    setIsLoading(true)
    void probe()
  }, [probe])

  return { status, isLoading, recheck }
}
