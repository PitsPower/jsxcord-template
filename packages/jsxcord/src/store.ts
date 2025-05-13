import type { Interaction } from './discord.js'
import EventEmitter from 'node:events'
import { useRef, useState } from 'react'
import { useAwait } from './async.js'
import { useInteraction } from './hook.js'

export interface StoreInput<I = any> { interaction: Interaction, input: I }

type StoreFunction =
  | ((_: StoreInput) => unknown | Promise<unknown>)
  | (() => unknown | Promise<unknown>)

type OutputQueryFunction<F extends StoreFunction> =
  F extends (_: StoreInput<infer I>) => infer O
    ? (Parameters<F> extends [] ? () => Awaited<O> : (_: I) => Awaited<O>)
    : never

type OutputMutationFunction<F extends StoreFunction> =
  F extends (_: StoreInput<infer I>) => infer O
    ? (Parameters<F> extends [] ? () => O : (_: I) => O)
    : never

type StoreFunctions = Record<string, StoreFunction>

type OutputQueryFunctions<F extends StoreFunctions> = { [P in keyof F]: OutputQueryFunction<F[P]> }
type OutputMutationFunctions<F extends StoreFunctions> = { [P in keyof F]: OutputMutationFunction<F[P]> }

export interface Store<Q extends StoreFunctions, M extends StoreFunctions> {
  queries: Q
  mutations: M
  _eventEmitter: EventEmitter<{ updated: [] }>
  _isWatching: boolean
  _timeoutMs?: number
}

export function createStore<Q extends StoreFunctions, M extends StoreFunctions>(
  store: Omit<Store<Q, M>, '_eventEmitter' | '_isWatching'>,
): Store<Q, M> {
  return {
    ...store,
    _eventEmitter: new EventEmitter(),
    _isWatching: false,
  }
}

export function watch<Q extends StoreFunctions, M extends StoreFunctions>(
  store: Store<Q, M>,
  timeoutMs?: number,
): Store<Q, M> {
  return {
    ...store,
    _isWatching: true,
    _timeoutMs: timeoutMs,
  }
}

export function useStore<Q extends StoreFunctions, M extends StoreFunctions>(
  store: Store<Q, M>,
): OutputQueryFunctions<Q> & OutputMutationFunctions<M> {
  const interaction = useInteraction()
  const [_, setInternal] = useState(0)
  const [createdAt] = useState(Date.now)

  const hasListened = useRef(false)

  if (store._isWatching) {
    if (!hasListened.current) {
      store._eventEmitter.once('updated', () => {
        if (!store._timeoutMs || Date.now() - createdAt < store._timeoutMs) {
          hasListened.current = false
          setInternal(Math.random())
        }
      })
      hasListened.current = true
    }
  }

  const result: OutputQueryFunctions<StoreFunctions> = {}

  for (const [name, func] of Object.entries(store.queries)) {
    result[name] = (input: any) => {
      return useAwait(async () => func({ interaction, input }))
    }
  }

  for (const [name, func] of Object.entries(store.mutations)) {
    result[name] = (input: any) => {
      const result = func({ interaction, input })

      if (result instanceof Promise) {
        result.then(() => {
          setInternal(Math.random())
          store._eventEmitter.emit('updated')
        })
      }
      else {
        setInternal(Math.random())
        store._eventEmitter.emit('updated')
      }
    }
  }

  return result as OutputQueryFunctions<Q> & OutputMutationFunctions<M>
}
