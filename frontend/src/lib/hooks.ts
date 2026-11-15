import { useCallback, useEffect, useState } from 'react'
import { friendlyError, onDataSourceChange } from '../api'

/** Tiny hash router: "#/plans/PLAN-1" → ["plans", "PLAN-1"]. */
export function useHashRoute(): string[] {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
  const [parts, setParts] = useState(parse)
  useEffect(() => {
    const on = () => setParts(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return parts
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : '/' + path
  window.scrollTo(0, 0)
}

export interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
  setData: (d: T) => void
}

/** Runs `fn` on mount / when deps change / when the data source flips. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => onDataSourceChange(reload), [reload])
  useEffect(() => {
    let alive = true
    setLoading(true)
    fn()
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(friendlyError(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, loading, reload, setData }
}
