import type { MessageComponentInteraction } from 'discord.js'
import { ModalBuilder } from 'discord.js'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { buildZodTypeForModal } from './zod.js'

interface ModalWithSchema<T extends z.ZodRawShape> {
  schema: T
  modal: ModalBuilder
}

export function createModal<T extends z.ZodRawShape>(title: string, inputs: T): ModalWithSchema<T> {
  const builder = new ModalBuilder()
    .setTitle(title)
    .setCustomId(uuidv4())

  for (const [key, value] of Object.entries(inputs)) {
    buildZodTypeForModal(builder, key, value)
  }

  return {
    schema: inputs,
    modal: builder,
  }
}

export async function showModal<T extends z.ZodRawShape>(
  interaction: MessageComponentInteraction,
  modalWithSchema: ModalWithSchema<T>,
) {
  interaction.showModal(modalWithSchema.modal)

  const response = await interaction.awaitModalSubmit({
    filter: i => i.customId === modalWithSchema.modal.data.custom_id,
    time: Infinity,
  })

  response.deferUpdate()

  const fields = Object.fromEntries(
    Object.keys(modalWithSchema.schema)
      .map(key => [key, response.fields.getTextInputValue(key) || undefined]),
  )

  return z.object(modalWithSchema.schema).parse(fields)
}
