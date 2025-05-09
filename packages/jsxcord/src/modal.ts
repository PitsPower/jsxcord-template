import type { MessageComponentInteraction } from 'discord.js'
import { ModalBuilder } from 'discord.js'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { buildZodTypeForModal } from './zod.js'

export interface ModalWithSchema<T extends z.ZodRawShape> {
  modal: ModalBuilder
  schema: T
}

export function createModal<T extends z.ZodRawShape>(title: string, inputs: T): ModalWithSchema<T> {
  const builder = new ModalBuilder()
    .setTitle(title)

  for (const [key, value] of Object.entries(inputs)) {
    buildZodTypeForModal(builder, key, value)
  }

  return {
    modal: builder,
    schema: inputs,
  }
}

export async function showModal<T extends z.ZodRawShape>(
  interaction: MessageComponentInteraction,
  modalWithSchema: ModalWithSchema<T>,
  timeoutMs?: number,
) {
  interaction.showModal(modalWithSchema.modal.setCustomId(uuidv4()))

  const response = await interaction.awaitModalSubmit({
    filter: i => i.customId === modalWithSchema.modal.data.custom_id,
    time: timeoutMs ?? (2 ** 32 - 1),
  })

  response.deferUpdate()

  const fields = Object.fromEntries(
    Object.keys(modalWithSchema.schema)
      .map(key => [key, response.fields.getTextInputValue(key) || undefined]),
  )

  return z.object(modalWithSchema.schema).parse(fields)
}
