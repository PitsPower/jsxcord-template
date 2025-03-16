/**
 * @packageDocumentation
 *
 * @categoryDescription Core
 * Core classes and functions.
 *
 * @categoryDescription Hooks
 * Various JSXcord-specific React hooks.
 */

import type { ChatInputCommandInteraction, Message, MessageCreateOptions } from 'discord.js'
import type { PropsWithChildren, ReactNode } from 'react'
import type { ManagedEmoji } from './emoji.js'
import type { AutocompleteFunction, ZodCommand } from './zod.js'
import { createAudioPlayer, joinVoiceChannel } from '@discordjs/voice'
import { Client, GatewayIntentBits, GuildMember, InteractionContextType, REST, Routes, SlashCommandBuilder } from 'discord.js'
import Queue from 'promise-queue'
import { createContext, Suspense, useState } from 'react'
import { z } from 'zod'
import { Mixer } from './audio.js'
import * as container from './container.js'
import { createEmoji, createEmojisFromFolder, EmojiContext, ManagedEmojiSymbol } from './emoji.js'
import { createMessageOptions, hydrateMessages, isMessageOptionsEmpty } from './message.js'
import { MutationContext } from './mutation.js'
import Renderer from './renderer.js'
import { sync } from './util.js'
import { buildZodType, getOptionsAsObject } from './zod.js'

export * from './async.js'
export * from './component.js'
export * from './hook.js'
export * from './mutation.js'
export * from './shared.js'
export { createEmoji, createEmojisFromFolder }

interface AudioContextData {
  mixer: Mixer
  joinVc: () => void
}

/** @internal */
export const AudioContext = createContext<AudioContextData | null>(null)
/** @internal */
export const InteractionContext = createContext<ChatInputCommandInteraction | null>(null)

class VoiceChannelError extends Error {}

const audioContextsPerGuild: Record<string, AudioContextData> = {}

interface JsxcordClient<Ready extends boolean = boolean> extends Client<Ready> {
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
    GatewayIntentBits.GuildVoiceStates,
  ] }) as JsxcordClient

  // Maps emoji names to their Markdown representations
  const emojiMap: Record<string, string> = {}

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

        emojiMap[emoji.emojiName] = appEmoji.toString()
      }))
    })

    return client
  }

  client.on('ready', (client) => {
    const rest = new REST().setToken(client.token)

    void rest.put(
      Routes.applicationCommands(client.user.id),
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
              buildZodType(builder, key, value)
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

    const root = container.create(client)
    const messages: Message[] = []

    const mixer = new Mixer()
    let hasJoinedVc = false

    const audioContext: AudioContextData
      = interaction.guildId && audioContextsPerGuild[interaction.guildId]
        ? audioContextsPerGuild[interaction.guildId]
        : {
            mixer,

            joinVc: () => {
              if (hasJoinedVc) {
                return
              }

              const member = interaction.member
              if (!(member instanceof GuildMember)) {
                throw new VoiceChannelError('User not in voice channel.')
              }

              const voiceChannel = member.voice.channel
              if (voiceChannel === null || !voiceChannel.joinable) {
                throw new VoiceChannelError('User not in voice channel.')
              }

              const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
              })

              const player = createAudioPlayer()
              connection.subscribe(player)

              player.play(mixer.getAudioResource())

              hasJoinedVc = true
            },
          }

    if (interaction.guildId) {
      audioContextsPerGuild[interaction.guildId] = audioContext
    }

    const messageOptions: MessageCreateOptions[] = []

    // Queue so things happen in correct order
    // (e.g. deferring and then responding)
    const queue = new Queue(1)

    root.onChange = () => queue.add(async () => {
      const newOptions = createMessageOptions(root)

      for (let i = 0; i < newOptions.length; i++) {
        const options = newOptions[i]

        if (
          JSON.stringify(messageOptions[i]) === JSON.stringify(options)
        ) {
          continue
        }

        if (!isMessageOptionsEmpty(options)) {
          messageOptions[i] = options
        }

        if (messages[i] !== undefined && !isMessageOptionsEmpty(options)) {
          messages[i] = await interaction.editReply({
            ...options,
            message: messages[i],
            flags: [],
          })
        }
        else if (i === 0) {
          if (isMessageOptionsEmpty(options)) {
            try {
              await interaction.deferReply()
            }
            catch { }
          }
          else if (interaction.deferred || interaction.replied) {
            messages[i] = messages[i] !== undefined
              ? await interaction.editReply({
                ...options,
                flags: [],
              })
              : await interaction.followUp({
                ...options,
                flags: [],
              })
          }
          else {
            const response = await interaction.reply({
              ...options,
              flags: [],
            })
            messages[i] = await response.fetch()
          }
        }
        else if (!isMessageOptionsEmpty(options)) {
          messages.push(await interaction.followUp({
            ...options,
            flags: [],
          }))
        }
      }

      hydrateMessages(messages, root)
    })

    function Root({ children }: PropsWithChildren) {
      // Use for `useMutation`
      const [internal, setInternal] = useState(0)

      return (
        <Suspense fallback={<></>}>
          <AudioContext.Provider value={audioContext}>
            <InteractionContext.Provider value={interaction as ChatInputCommandInteraction}>
              <MutationContext.Provider value={{ internal, setInternal }}>
                <EmojiContext.Provider value={emojiMap}>
                  {children}
                </EmojiContext.Provider>
              </MutationContext.Provider>
            </InteractionContext.Provider>
          </AudioContext.Provider>
        </Suspense>
      )
    }

    Renderer.render(<Root>{command}</Root>, root)
  }))

  return client
}
