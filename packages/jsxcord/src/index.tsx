/**
 * @packageDocumentation
 *
 * @categoryDescription Core
 * Core classes and functions.
 *
 * @categoryDescription Hooks
 * Various JSXcord-specific React hooks.
 */

import type { ApplicationEmoji, ChatInputCommandInteraction } from 'discord.js'
import type { ReactNode } from 'react'
import type { ManagedEmoji } from './emoji.js'
import type { AutocompleteFunction, ZodCommand } from './zod.js'
import { Client, GatewayIntentBits, InteractionContextType, REST, Routes, SlashCommandBuilder } from 'discord.js'
import { z } from 'zod'
import { createEmoji, createEmojisFromFolder, ManagedEmojiSymbol } from './emoji.js'
import { render, setupRoot } from './root.js'
import { sync } from './util.js'
import { buildZodTypeForCommand, getOptionsAsObject } from './zod.js'

export * from './async.js'
export * from './component.js'
export * from './hook.js'
export * from './modal.js'
export * from './mutation.js'
export * from './shared.js'
export { createEmoji, createEmojisFromFolder, render }

export interface JsxcordClient<Ready extends boolean = boolean> extends Client<Ready> {
  emojiMap: Record<string, ApplicationEmoji>
  registerEmojis: (...emojis: (ManagedEmoji | Record<string, ManagedEmoji>)[]) => JsxcordClient<Ready>
}

/**
 * Creates a JSXcord `Client`.
 *
 * @param commands The bot's commands.
 *
 * This object specifies commands, where each key is the name
 * of a command, and each value is either:
 * - A `ReactNode` to be rendered.
 * - A {@link ZodCommand | `ZodCommand`}.
 * - A function that accepts a `ChatInputCommandInteraction`.
 *
 * @returns A JSXcord `Client`.
 *
 * @category Core
 */
export function bot(
  commands: Record<
    string,
    | ReactNode
    | ZodCommand<z.ZodRawShape, true>
    | ((interaction: ChatInputCommandInteraction) => Promise<void>)
  >,
): JsxcordClient {
  const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ] }) as JsxcordClient

  // Maps emoji names to their Markdown representations
  client.emojiMap = {}

  client.registerEmojis = (...emojis: (ManagedEmoji | Record<string, ManagedEmoji>)[]) => {
    client.on('ready', async () => {
      const allEmojis = await client.application?.emojis.fetch()

      const emojisArray = emojis
        .map(emoji =>
          emoji.__type === ManagedEmojiSymbol ? [emoji] : Object.values(emoji),
        )
        .flat()

      await Promise.all(emojisArray.map(async (emoji) => {
        const appEmoji
          = allEmojis?.find(e => e.name === emoji.emojiName)
            ?? await client.application?.emojis.create({
              name: emoji.emojiName,
              attachment: emoji.emojiSrc,
            })

        if (appEmoji === undefined) {
          throw new Error(`Failed to create emoji`)
        }

        client.emojiMap[emoji.emojiName] = appEmoji
      }))
    })

    return client
  }

  client.on('ready', (client) => {
    const rest = new REST().setToken(client.token)

    void rest.put(
      Routes.applicationCommands(client.application.id),
      {
        body: Object.entries(commands).map(([name, command]) => {
          const builder = new SlashCommandBuilder()
            .setName(name)
            .setDescription('No description')
            .setContexts(
              InteractionContextType.Guild,
              InteractionContextType.BotDM,
              InteractionContextType.PrivateChannel,
            )

          if (command instanceof z.ZodObject) {
            for (const [key, value] of Object.entries(command.shape as object)) {
              buildZodTypeForCommand(builder, key, value)
            }
          }

          return builder.toJSON()
        }),
      },
    )
  })

  client.on('interactionCreate', sync(async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) {
      return
    }

    let command = commands[interaction.commandName]

    if (interaction.isAutocomplete()) {
      if (command instanceof z.ZodObject) {
        const option = interaction.options.getFocused(true)
        const arg = command._def.shape()[option.name]

        if ('_autocompleteFunc' in arg) {
          const autocompleteFunc = arg._autocompleteFunc as AutocompleteFunction
          const results = await autocompleteFunc(option.value)
          await interaction.respond(results)
        }
      }

      return
    }

    if (typeof command === 'function') {
      await command(interaction)
      return
    }
    else if (command instanceof z.ZodObject) {
      const options = command.parse(getOptionsAsObject(interaction.options))
      // command = command._componentFunc(options)
      // const Component = asyncComponent(command._componentFunc)
      const Component = command._componentFunc
      command = <Component {...options} />
    }

    setupRoot(interaction, client, command)
  }))

  return client
}
