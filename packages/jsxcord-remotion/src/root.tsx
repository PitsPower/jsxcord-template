import type { CompositionProps } from 'remotion'
import type { AnyZodObject } from 'zod'
import React from 'react'
import { Composition, registerRoot } from 'remotion'

export type RegisteredRootBuilder<Components>
  = RootBuilder<Components, true>

export type FormatOptions =
  | { still?: boolean, gif?: undefined }
  | { still?: undefined, gif?: boolean }

export class RootBuilder<Components, Registered = false> {
  private remotionCompositions: JSX.Element[] = []
  public _componentIds: string[] = []
  private _phantom!: Registered

  add<Id extends string, Props extends Record<string, unknown>>(
    props: CompositionProps<AnyZodObject, Props> & { id: Id },
  ): RootBuilder<Components & { [_ in Id]: React.FC<Props & FormatOptions> }, Registered> {
    this.remotionCompositions.push(
      <Composition key={Math.random()} {...props} />,
    )

    this._componentIds.push(props.id)

    return this
  }

  register(): RegisteredRootBuilder<Components> {
    registerRoot(() => this.remotionCompositions)
    return this as RegisteredRootBuilder<Components>
  }
}
