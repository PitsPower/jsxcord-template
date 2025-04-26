import type { ButtonInteraction } from 'discord.js'
import { readFile, writeFile } from 'node:fs/promises'
import { GoogleGenAI, Modality } from '@google/genai'
import { Audio, bot, Button, createGuildState, Embed, Ephemeral, Heading, Img, render, useFollowUp, useSharedState, watch, withLoader } from '@repo/jsxcord'
import { command, z } from '@repo/jsxcord/zod'
import { logger } from '@repo/logger'
import { $ } from 'bun'
import { Vibrant } from 'node-vibrant/node'
import { useEffect, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { MarkovChain } from './markov/markov.js'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

async function generateFilter(description: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    config: {
      responseModalities: [Modality.TEXT],
      systemInstruction: `
        Create an ffmpeg AUDIO filter string that matches the given input.
        Only output the audio filter string, nothing else. Do not put quotes around it.

        Here is an example of the command your filter will be used in:
        ffmpeg -i - -af "FILTER HERE" -f mp3 -
      `,
    },
    contents: description,
  })
  return response.text ?? ''
}

async function getUrlInfo(url: string) {
  const info = await $`yt-dlp -J ${url}`.json() as {
    title: string
    description: string
    thumbnails: { url: string, preference: number }[]
  }

  const thumbnailUrl = info.thumbnails[0].url
  const palette = await Vibrant.from(thumbnailUrl).getPalette()

  // console.log(thumbnailUrl)
  // const response = await fetch(thumbnailUrl)
  // const thumbnailBuffer = await response.arrayBuffer()
  // const colors = await getColors(Buffer.from(thumbnailBuffer))

  return {
    ...info,
    thumbnail: {
      color: palette.Vibrant?.hex ?? 'yellow',
      src: thumbnailUrl,
    },
  }
}

async function getOutputBuffer(url: string, filter?: string) {
  const ffmpegFilter = filter
    ? await generateFilter(filter)
    : null

  const cmd = ffmpegFilter
    ? $`yt-dlp -x ${url} -o - | ffmpeg -i - -af ${ffmpegFilter} -f mp3 -`
    : $`yt-dlp -x ${url} -o -`

  const output = await cmd.quiet()

  return output.stdout
}

interface QueueEntry {
  buffer: Buffer
  info: Awaited<ReturnType<typeof getUrlInfo>>
}

function QueueEmbed({ info }: { info: QueueEntry['info'] }) {
  async function showMore(interaction: ButtonInteraction) {
    await interaction.reply(
      await render(
        interaction,
        <Ephemeral>
          <Embed
            title={info.title}
            description={info.description}
            color={info.thumbnail.color}
            thumbnail={<Img src={info.thumbnail.src} />}
          />
        </Ephemeral>,
      ),
    )
  };

  return (
    <>
      <Embed
        title={info.title}
        description={info.description.slice(0, 200).split('\n').slice(0, 5).join('\n')}
        color={info.thumbnail.color}
        thumbnail={<Img src={info.thumbnail.src} />}
      />
      <Button onClick={showMore}>
        Show More
      </Button>
    </>
  )
}

type Queue = (QueueEntry & { id: number })[]
const QueueState = createGuildState<Queue>([])

function QueueItem({ buffer, info }: QueueEntry) {
  const followUp = useFollowUp()
  const [queue, setQueue] = useSharedState(watch(QueueState))

  const [queueId] = useState(Math.random)
  const [isPlaying, setIsPlaying] = useState(false)

  // Add to the queue on mount
  useEffect(() => {
    setQueue(queue => [
      ...queue,
      {
        id: queueId,
        buffer,
        info,
      },
    ])
  }, [])

  // If we're at the front of the queue, play
  // Otherwise, stop playing
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(queue.map(item => item.id))

    if (queue[0]?.id === queueId) {
      if (!isPlaying) {
        setIsPlaying(true)
        followUp(<QueueEmbed info={info} />)
      }
    }
    else {
      setIsPlaying(false)
    }
  }, [queue])

  return (
    <>
      Added to queue!
      <Audio
        src={buffer}
        paused={!isPlaying}
        onFinish={() => {
          // eslint-disable-next-line no-console
          console.log('Finished playing ', queueId)
          setQueue(queue => queue.filter(entry => entry.id !== queueId))
        }}
      />
    </>
  )
}

const YouTubeAudioRaw = withLoader(
  QueueItem,

  async ({ url, filter }: { url: string, filter?: string }) => {
    const [buffer, info] = await Promise.all([
      getOutputBuffer(url, filter),
      getUrlInfo(url),
    ])

    return { url, filter, buffer, info }
  },
)

function YouTubeAudio({ url, filter }: { url: string, filter?: string }) {
  return (
    <ErrorBoundary fallback="Failed.">
      <YouTubeAudioRaw url={url} filter={filter} />
    </ErrorBoundary>
  )
}

function StarTest() {
  return (
    <>
      <Heading>Playing??</Heading>
      <Audio src="https://stream.radiocaroline.net/rc128/;" />
    </>
  )
}

const client = bot({
  play: command({ url: z.string(), filter: z.string().optional() }).component(YouTubeAudio),
  test: command({}).component(StarTest),
})
  .on('ready', async () => logger.info('Bot started'))

// Markov chain stuff

const MARKOV_FILE = './data/markov.json'

const markovData = await readFile(MARKOV_FILE, 'utf-8')

let markovChain
try {
  markovChain = MarkovChain.fromString(markovData)
}
catch (error) {
  logger.error('Failed to load markov chain', error)
  markovChain = new MarkovChain()
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return
  }

  markovChain.addSentence(message.content)

  const repliedMessage = message.reference?.messageId
    ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
    : null

  const shouldReply
    = Math.random() < 0.1
      || message.mentions.has(client.user!.id)
      || repliedMessage?.author.id === client.user!.id

  if (shouldReply) {
    await message.reply(markovChain.generateSentence())
  }

  await writeFile(MARKOV_FILE, markovChain.toString())
})

client.login(process.env.DISCORD_TOKEN!)
