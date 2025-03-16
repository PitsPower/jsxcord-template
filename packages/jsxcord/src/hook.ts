import type { ReactNode } from 'react'
import type { JsxcordClient } from './index.js'
import { useContext } from 'react'
import { InteractionContext, setupRoot } from './root.js'

/**
 * Returns the `Interaction` that executed the command.
 * Must be used inside a JSXcord component.
 * @category Hooks
 */
export function useInteraction() {
  const result = useContext(InteractionContext)
  if (result === null) {
    throw new Error('Cannot use `useInteraction` outside of a JSXcord component.')
  }
  return result
}

export function useFollowUp() {
  const interaction = useInteraction()

  return async (component: ReactNode) => {
    await setupRoot(interaction, interaction.client as JsxcordClient, component)
  }
}
