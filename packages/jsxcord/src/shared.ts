import type { z } from 'zod'
import type { Interaction } from './discord.js'
import type { Store, StoreInput } from './store.js'
import EventEmitter from 'node:events'
import { promises as fs } from 'node:fs'
import { ZodType } from 'zod'
import { init } from 'zod-empty'
import { createStore, useStore } from './store.js'

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

function getInitialValue<DataOrSchema>(sharedState: DataOrSchema): ActualData<DataOrSchema> {
  return sharedState instanceof ZodType
    ? init(sharedState)
    : sharedState
}

type StateType = 'global' | 'guild' | 'user'

function getKey(interaction: Interaction, type: StateType) {
  switch (type) {
    case 'global': return 'global'
    case 'guild': return interaction.guildId
    case 'user': return interaction.user.id
  }
}

function createSharedStateFunc(type: StateType) {
  return function <DataOrSchema>(
    initialValue: DataOrSchema,
    maybeDataStore?: DataStore<ActualData<DataOrSchema>>,
  ) {
    const dataStore = maybeDataStore ?? new MemoryDataStore()

    function parseAndErrorIfInvalid<DataOrSchema>(
      initialValue: DataOrSchema,
      data: ActualData<DataOrSchema>,
    ) {
      if (initialValue instanceof ZodType) {
        return initialValue.parse(data) as ActualData<DataOrSchema>
      }
      else {
        return data
      }
    }

    return createStore({
      queries: {
        get({ interaction }: StoreInput<undefined>) {
          const key = getKey(interaction, type)
          if (key === null) {
            throw new Error('`useSharedState` key not found.')
          }
          return dataStore.get(key, parseAndErrorIfInvalid(initialValue, getInitialValue(initialValue)))
        },
      },
      mutations: {
        set({ interaction, input }: StoreInput<(_: ActualData<DataOrSchema>) => ActualData<DataOrSchema>>) {
          const key = getKey(interaction, type)
          if (key === null) {
            throw new Error('`useSharedState` key not found.')
          }
          return dataStore.update(
            key,
            parseAndErrorIfInvalid(initialValue, getInitialValue(initialValue)),
            input,
          )
        },
      },
    })
  }
}

type SharedStateStore<DataOrSchema> = Store<
  { get: (_: StoreInput<undefined>) => Promise<ActualData<DataOrSchema>> },
  { set: (_: StoreInput<(_: ActualData<DataOrSchema>) => ActualData<DataOrSchema>>) => Promise<ActualData<DataOrSchema>> }
>

export const createGlobalState = createSharedStateFunc('global')
export const createGuildState = createSharedStateFunc('guild')
export const createUserState = createSharedStateFunc('user')

export function useSharedState<DataOrSchema>(
  store: SharedStateStore<DataOrSchema>,
): [
    ActualData<DataOrSchema>,
    (transition: (prevState: ActualData<DataOrSchema>) => ActualData<DataOrSchema>) => void,
  ] {
  const { get, set } = useStore(store)
  return [get(undefined), set]
}
