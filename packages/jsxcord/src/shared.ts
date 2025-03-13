import type { z } from 'zod'
import EventEmitter from 'node:events'
import { promises as fs } from 'node:fs'
import { useState } from 'react'
import { use } from 'react-use-polyfill'
import { ZodType } from 'zod'
import { init } from 'zod-empty'
import { useInteraction } from './hook.js'
import { sync } from './util.js'

/**
 * A generic class for specifying a way of storing data.
 *
 * {@link DataStore | `DataStore`} objects can be passed into shared state creators,
 * such as {@link createGuildState | `createGuildState`}, like so:
 *
 * ```ts
 * // Stores the value of `CounterState` in a JSON file.
 * const CounterState = createGuildState(0, new JsonDataStore("data/counter.json"))
 * ```
 *
 * You can extend {@link DataStore | `DataStore`} yourself to enable custom storage methods.
 * Here's an example of a {@link DataStore | `DataStore`} that stores data in memory:
 * ```
 * class MemoryDataStore<S> extends DataStore<S> {
 *   private data: Record<string, S> = {}
 *
 *   async get(key: string, initialValue: S) {
 *     return key in this.data ? this.data[key] : initialValue
 *   }
 *
 *   async set(key: string, value: S) {
 *     this.data[key] = value
 *   }
 * }
 * ```
 *
 * @typeParam Data - The data type stored in the {@link DataStore | `DataStore`}.
 */
export abstract class DataStore<Data> extends EventEmitter<{ change: [{ key: string, value: Data }] }> {
  /**
   * Gets some data from the {@link DataStore | `DataStore`}.
   *
   * @param key The key to get data from.
   *
   * The value of this key depends on context.
   * For example, when the {@link DataStore | `DataStore`} is used in
   * {@link createGuildState | `createGuildState`}, the key will be the guild id.
   *
   * @param initialValue The initial value of the data.
   * Return this if no data is present.
   *
   * @returns The data.
   */
  abstract get(key: string, initialValue: Data): Promise<Data>

  /**
   * Sets some data in the {@link DataStore | `DataStore`}.
   *
   * @param key The key to set data in.
   *
   * The value of this key depends on context.
   * For example, when the {@link DataStore | `DataStore`} is used in
   * {@link createGuildState | `createGuildState`}, the key will be the guild id.
   *
   * @param value The value to set it.
   */
  abstract set(key: string, value: Data): Promise<void>

  /**
   * Updates some data in the {@link DataStore | `DataStore`}
   * according to a transition function.
   *
   * This is useful if your storage method supports atomic transactions,
   * In that case, you should implement this method using transactions
   * for extra safety.
   *
   * @param key The key to set data in.
   *
   * The value of this key depends on context.
   * For example, when the {@link DataStore | `DataStore`} is used in
   * {@link createGuildState | `createGuildState`}, the key will be the guild id.
   *
   * @param initialValue The initial value of the data.
   *
   * @param transition A function that maps the old data to the new data.
   */
  async update(key: string, initialValue: Data, transition: (prevData: Data) => Data) {
    const value = transition(await this.get(key, initialValue))
    await this.set(key, value)
    return value
  }

  /** @internal */
  async updateAndEmit(key: string, initialValue: Data, transition: (prevState: Data) => Data) {
    const value = await this.update(key, initialValue, transition)
    this.emit('change', { key, value })
    return value
  }
}

class MemoryDataStore<Data> extends DataStore<Data> {
  private data: Record<string, Data> = {}

  async get(key: string, initialValue: Data) {
    return key in this.data ? this.data[key] : initialValue
  }

  async set(key: string, value: Data) {
    this.data[key] = value
  }
}

/**
 * An implementation of {@link DataStore | `DataStore`} that stores
 * data in a JSON file.
 *
 * @typeParam Data - The data type stored in the {@link JsonDataStore | `JsonDataStore`}.
 */
export class JsonDataStore<Data> extends DataStore<Data> {
  /**
   * @param fp The file path to store the data in.
   */
  constructor(private fp: string) {
    super()
    fs.access(fp).catch(async () => fs.writeFile(fp, '{}'))
  }

  async get(key: string, initialValue: Data) {
    const data = JSON.parse(await fs.readFile(this.fp, 'utf8')) as Record<string, Data>
    return key in data ? data[key] : initialValue
  }

  async set(key: string, value: Data) {
    const data = JSON.parse(await fs.readFile(this.fp, 'utf8')) as Record<string, Data>
    data[key] = value
    await fs.writeFile(this.fp, JSON.stringify(data))
  }
}

type ActualData<DataOrSchema> = DataOrSchema extends ZodType
  ? z.infer<DataOrSchema>
  : DataOrSchema

interface SharedState<DataOrSchema> {
  readonly _type: 'global' | 'guild' | 'user'
  readonly _initialValue: DataOrSchema
  readonly _isWatching: boolean
  readonly _dataStore: DataStore<ActualData<DataOrSchema>>
  readonly _cache: Record<string, Promise<ActualData<DataOrSchema>>>
}

function createSharedStateFunc(type: SharedState<unknown>['_type']) {
  return function <DataOrSchema>(
    initialValue: DataOrSchema,
    dataStore?: DataStore<ActualData<DataOrSchema>>,
  ): SharedState<DataOrSchema> {
    return {
      _type: type,
      _initialValue: initialValue,
      _isWatching: false,
      _dataStore: dataStore ?? new MemoryDataStore(),
      _cache: {},
    }
  }
}

export const createGlobalState = createSharedStateFunc('global')
export const createGuildState = createSharedStateFunc('guild')
export const createUserState = createSharedStateFunc('user')

export function watch<Data>(sharedState: SharedState<Data>): SharedState<Data> {
  return { ...sharedState, _isWatching: true }
}

function getInitialValue<DataOrSchema>(sharedState: SharedState<DataOrSchema>) {
  return sharedState._initialValue instanceof ZodType
    ? init(sharedState._initialValue)
    : sharedState._initialValue
}

/** @internal */
function parseAndErrorIfInvalid<DataOrSchema>(
  sharedState: SharedState<DataOrSchema>,
  data: ActualData<DataOrSchema>,
) {
  if (sharedState._initialValue instanceof ZodType) {
    return sharedState._initialValue.parse(data) as ActualData<DataOrSchema>
  }
  else {
    return data
  }
}

export function useSharedState<DataOrSchema>(
  sharedState: SharedState<DataOrSchema>,
): [
    ActualData<DataOrSchema>,
    (transition: (prevState: ActualData<DataOrSchema>) => ActualData<DataOrSchema>) => void,
  ] {
  type Data = ActualData<DataOrSchema>

  const interaction = useInteraction()

  // Each type of shared state has a key associated with it to
  // differentiate guilds, users, etc.
  const keys: Record<SharedState<DataOrSchema>['_type'], string | null> = {
    global: 'global',
    guild: interaction.guildId,
    user: interaction.user.id,
  }
  const key = keys[sharedState._type]
  if (key === null) {
    throw new Error('`useSharedState` key not found.')
  }

  // Get initial value

  if (!(key in sharedState._cache)) {
    const initialValue = getInitialValue(sharedState)
    sharedState._cache[key] = sharedState._dataStore.get(key, initialValue)
  }

  const value = parseAndErrorIfInvalid(sharedState, use(sharedState._cache[key]))
  delete sharedState._cache[key]

  // The internal state where the value is stored
  const [state, setState] = useState(value)

  // Stores the value, and parses the zod schema if it's given
  const newSetState = sync(async (transition: (prevState: Data) => Data) => {
    const newTransition = sharedState._initialValue instanceof ZodType
      ? (prevState: Data) => transition(
          parseAndErrorIfInvalid(sharedState, prevState),
        )
      : transition

    const initialValue = getInitialValue(sharedState)
    const data = await sharedState._dataStore.updateAndEmit(key, initialValue, newTransition)
    setState(data)
  })

  // Watch for changes
  if (sharedState._isWatching) {
    sharedState._dataStore.once('change', ({ key: k, value: v }) => {
      if (k === key) {
        setState(v)
      }
    })
  }

  return [state, newSetState]
}
