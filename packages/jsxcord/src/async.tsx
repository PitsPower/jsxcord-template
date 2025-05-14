import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useInteraction } from './hook.js'
import { use } from './react.js'

/**
 * Below lies the implementation `useAwait`. Proceed with caution!
 *
 * This function relies on a few global variables:
 * - `promiseCache`: promiseCache[interaction.id][index] stores a `Promise`
 * - `indices`: indices[interaction.id] stores the value for `index` above
 *
 * Each invocation of a component gets its own `interaction.id` value, and
 * we can assign a fixed index to each call to `useAwait` within the component
 * (as long as the rules of hooks aren't violated).
 *
 * This is essentially how `useState` works, except we can't use that here
 * because we're storing stuff in the middle of a render.
 */

const promiseCache: Record<string, Record<number, Promise<unknown>>> = {}
const indices: Record<string, number> = {}

export function useAwait<T>(func: () => Promise<T>, deps?: unknown[]): T {
  const interaction = useInteraction()
  const cacheId = interaction.id
  const index = indices[cacheId] ?? 0

  if (!promiseCache[cacheId]) {
    promiseCache[cacheId] = {}
  }

  // This gets called every time the component finishes rendering completely.
  // We reset this here because on the next render, we're starting the entire process again.
  useEffect(() => {
    indices[cacheId] = 0
  })

  // `useEffect` fires whenever the deps changed, *and* on first render.
  // We use this to get around that.
  const isFirstRender = useRef(true)

  useEffect(() => {
    // If no deps, then we never want to cache.
    // If deps, then cache when they haven't changed.
    if (deps === undefined || deps.length > 0 || !isFirstRender.current) {
      delete promiseCache[cacheId][index]
    }
    isFirstRender.current = false
  }, deps)

  // If we've cached the rpomise, get the result.
  if (cacheId in promiseCache && index in promiseCache[cacheId]) {
    const cachedValue = promiseCache[cacheId][index]
    const result = use(cachedValue)

    // We've resolved this `useAwait` call, so we move onto the next one.
    indices[cacheId] = index + 1

    return result as T
  }

  const promise = func()
  promiseCache[cacheId][index] = promise
  // The value hasn't been cached, so our component is going to be called again.
  // Therefore, we're going back to the *first* `useAwait` call.
  indices[cacheId] = 0
  return use(promise)
}

const loaderResults: Record<string, Promise<unknown>> = {}

export function withLoader<LoaderProps extends object, Props extends object>(
  Component: React.FC<LoaderProps & Props>,
  loader: (props: LoaderProps) => Promise<Props>,
): React.FC<LoaderProps> {
  const cacheId = Math.random().toString()

  return (props) => {
    if (cacheId in loaderResults) {
      const newProps = use(loaderResults[cacheId]) as Props
      delete loaderResults[cacheId]
      return <Component {...props} {...newProps} />
    }

    const promise = loader(props)
    loaderResults[cacheId] = promise
    const newProps = use(promise)

    return <Component {...props} {...newProps} />
  }
}

export function asyncComponent<Props extends object>(
  func: (props: Props) => Promise<ReactNode>,
): React.FC<Props> {
  const Component = ({ component }: { component: ReactNode }) => component

  return withLoader(
    Component,
    async (props: Props) => ({
      component: await func(props),
    }),
  )
}
