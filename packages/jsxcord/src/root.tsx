import type { BaseMessageOptionsWithPoll, ChatInputCommandInteraction, Interaction, InteractionReplyOptions, Message } from 'discord.js'
import type { PropsWithChildren, ReactNode } from 'react'
import type { JsxcordClient } from './index.js'
import { createAudioPlayer, joinVoiceChannel } from '@discordjs/voice'
import { GuildMember, InteractionContextType } from 'discord.js'
import Queue from 'promise-queue'
import { createContext, Suspense, useState } from 'react'
import { Mixer } from './audio.js'
import * as container from './container.js'
import { EmojiContext } from './emoji.js'
import { createMessageOptions, hydrateMessages, isMessageOptionsEmpty } from './message.js'
import { MutationContext } from './mutation.js'
import Renderer from './renderer.js'

interface AudioContextData {
  mixer: Mixer
  joinVc: () => void
}

const audioContextsPerGuild: Record<string, AudioContextData> = {}

class VoiceChannelError extends Error {}

/** @internal */
export const AudioContext = createContext<AudioContextData | null>(null)
/** @internal */
export const InteractionContext = createContext<ChatInputCommandInteraction | null>(null)

function createWrapper(
  interaction: Interaction,
  client: JsxcordClient,
): React.FC<{ children: React.ReactNode }> {
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

  function Wrapper({ children }: PropsWithChildren) {
    // Used for `useMutation`
    const [internal, setInternal] = useState(0)

    return (
      <Suspense fallback={<></>}>
        <AudioContext.Provider value={audioContext}>
          <InteractionContext.Provider value={interaction as ChatInputCommandInteraction}>
            <MutationContext.Provider value={{ internal, setInternal }}>
              <EmojiContext.Provider value={client.emojiMap}>
                {children}
              </EmojiContext.Provider>
            </MutationContext.Provider>
          </InteractionContext.Provider>
        </AudioContext.Provider>
      </Suspense>
    )
  }

  return Wrapper
}

export async function render(
  interaction: Interaction,
  component: ReactNode,
): Promise<BaseMessageOptionsWithPoll> {
  const client = interaction.client as JsxcordClient
  const root = container.create(client)
  const Wrapper = createWrapper(interaction, client)

  return new Promise((resolve) => {
    root.onChange = async () => {
      const options = createMessageOptions(root)
        .filter(options => !isMessageOptionsEmpty(options))

      if (options[0]) {
        resolve(options[0])
      }
    }

    Renderer.render(<Wrapper>{component}</Wrapper>, root)
  })
}

export async function setupRoot(
  interaction: ChatInputCommandInteraction,
  client: JsxcordClient,
  component: ReactNode,
): Promise<void> {
  const root = container.create(interaction.client)
  const messages: Message[] = []
  const messageOptions: InteractionReplyOptions[] = []

  const Wrapper = createWrapper(interaction, client)

  // Queue so things happen in correct order
  // (e.g. deferring and then responding)
  const queue = new Queue(1)

  return new Promise((resolve) => {
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
          if (interaction.context === InteractionContextType.Guild) {
            messages[i] = await messages[i].edit({
              ...options,
              flags: [],
            })
          }
          else {
            messages[i] = await interaction.editReply({
              ...options,
              message: messages[i],
              flags: [],
            })
          }
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
                flags: options.flags ?? [],
              })
          }
          else {
            const response = await interaction.reply({
              ...options,
              flags: options.flags ?? [],
            })
            messages[i] = await response.fetch()
          }
        }
        else if (!isMessageOptionsEmpty(options)) {
          messages.push(await interaction.followUp({
            ...options,
            flags: options.flags ?? [],
          }))
        }
      }

      // Resolve the promise after all messages have been sent
      resolve()

      hydrateMessages(messages, root)
    })

    Renderer.render(<Wrapper>{component}</Wrapper>, root)
  })
}
