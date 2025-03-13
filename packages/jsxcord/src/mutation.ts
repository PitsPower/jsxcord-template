import { createContext, useContext } from 'react'
import { use } from 'react-use-polyfill'
import { createGlobalState, useSharedState } from './shared.js'

export const MutationContext = createContext({
  internal: 0,
  setInternal: (_internal: number) => {},
})

const useQueryCache: Record<string, unknown> = {}

const CacheState = createGlobalState(Math.random())

export function useQuery<T>(
  func: () => T | Promise<T>,
): T {
  // Triggers re-render if the context changes!
  useContext(MutationContext)

  const [cacheId] = useSharedState(CacheState)

  if (cacheId in useQueryCache) {
    const cachedValue = useQueryCache[cacheId] as T | Promise<T>
    const result = cachedValue instanceof Promise
      ? use(cachedValue)
      : cachedValue

    delete useQueryCache[cacheId]

    return result
  }

  const resultOrPromise = func()
  useQueryCache[cacheId] = resultOrPromise

  return resultOrPromise instanceof Promise
    ? use(resultOrPromise)
    : resultOrPromise
}

export function useMutation<Args extends unknown[]>(
  func: (...args: Args) => void | Promise<void>,
): (...args: Args) => void {
  const { setInternal } = useContext(MutationContext)

  return async (...args) => {
    await func(...args)
    setInternal(Math.random())
  }
}
