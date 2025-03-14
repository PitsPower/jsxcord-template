import type { Readable } from 'node:stream'
import type { PropsWithChildren, ReactNode } from 'react'
import type { TrackHandle } from './audio.js'
import type { Instance, WhitelistProps } from './instance.js'
import type { ALL_LANGUAGES } from './languages.js'
import path from 'node:path'
import { URL } from 'node:url'
import { time, TimestampStyles } from 'discord.js'
import { createContext, createElement, useContext, useEffect, useState } from 'react'
import { streamResource } from './audio.js'
import { AudioContext, useInteraction } from './index.js'
import {
  ActionRowInstance,
  AnswerInstance,
  ButtonInstance,
  EmbedInstance,
  FieldInstance,
  FileInstance,
  ImageInstance,
  MarkdownInstance,
  OptionInstance,
  PollInstance,
  SelectInstance,
  ThumbnailInstance,
  WhitelistInstance,
} from './instance.js'
import { use } from './react.js'

/** @internal */
export interface NodeProps<P, I extends Instance> {
  props: P
  children: ReactNode
  createInstance: (props: P) => I
}

function Node<P, I extends Instance>(props: NodeProps<P, I>) {
  return createElement('node', props)
}

function createComponent<P, I extends Instance>(
  InstanceClass: { createInstance: (props: P) => I },
): (props: PropsWithChildren<P>) => JSX.Element {
  return props => (
    <Node props={props} createInstance={InstanceClass.createInstance}>
      {props.children}
    </Node>
  )
}

const Thumbnail = createComponent(ThumbnailInstance)

export const ActionRow = createComponent(ActionRowInstance)
export const Answer = createComponent(AnswerInstance)
export const Button = createComponent(ButtonInstance)

const RawEmbed = createComponent(EmbedInstance)

export function Embed(props: Parameters<typeof RawEmbed>[0] & { thumbnail?: ReactNode }) {
  return (
    <RawEmbed {...props}>
      {props.thumbnail && <Thumbnail>{props.thumbnail}</Thumbnail>}
      {props.children}
    </RawEmbed>
  )
}

export const Field = createComponent(FieldInstance)
export const File = createComponent(FileInstance)

export const ImageFilterContext = createContext(
  (src: string | ArrayBuffer): string | ArrayBuffer | Promise<string | ArrayBuffer> => src,
)

const RawImage = createComponent(ImageInstance)

function ImageInternal(
  props: Omit<Parameters<typeof RawImage>[0], 'src'> &
    { src: string | ArrayBuffer | Promise<string | ArrayBuffer> },
) {
  const resolvedSrc = props.src instanceof Promise
    ? use(props.src)
    : props.src

  return <RawImage {...props} src={resolvedSrc} />
}

export function Img(props: Parameters<typeof RawImage>[0]) {
  const imageFilter = useContext(ImageFilterContext)
  return <ImageInternal {...props} src={imageFilter(props.src)} />
}

/**
 * Renders Discord Markdown.
 *
 * By default, all Markdown in strings is escaped. If you wish
 * to use Markdown, it's recommended that you use dedicated
 * components, such as {@link Heading | `<Heading>`}.
 *
 * However, in cases where that won't suffice, you may pass raw Markdown
 * into the {@link Markdown | `<Markdown>`} component instead.
 *
 * ### Usage
 * ```tsx
 * <>
 *   <Markdown># This will render as a heading.</Markdown>
 *   # This will NOT render as a heading.
 * </>
 * ```
 */
export const Markdown = createComponent(MarkdownInstance)
export const Option = createComponent(OptionInstance)
export const Poll = createComponent(PollInstance)
export const Select = createComponent(SelectInstance)

function createMarkdownComponent<Props>(func: (input: string, props: Props) => string) {
  return (props: PropsWithChildren<Props>) => {
    const input = Array.isArray(props.children)
      ? props.children.map(child => child.toString()).join('')
      : props.children?.toString()
    if (input === undefined) {
      throw new Error('Expected text in <Markdown>.')
    }
    return <Markdown>{func(input, props)}</Markdown>
  }
}

export const Br = () => '\n'

export const Heading = createMarkdownComponent(str => `# ${str}\n`)
export const Subheading = createMarkdownComponent(str => `## ${str}\n`)
export const Subsubheading = createMarkdownComponent(str => `### ${str}\n`)
export const Tiny = createMarkdownComponent(str => `-# ${str}\n`)

export const Code = createMarkdownComponent(str => `\`${str}\``)
export const CodeBlock = createMarkdownComponent<{ language?: typeof ALL_LANGUAGES[number] }>(
  (str, props) =>
    `\`\`\`${props.language ?? ''}\n${str}\`\`\``,
)

export const Quote = createMarkdownComponent(str => `> ${str}\n`)

function isUrl(input: string) {
  try {
    const _url = new URL(input)
    return true
  }
  catch {
    return false
  }
}

interface AudioProps {
  src: string | Buffer | Readable | ReadableStream | NodeJS.ReadableStream
  onStart?: () => void
  onFinish?: () => void
  paused?: boolean
}

export function Audio({ src, onStart, onFinish, paused }: AudioProps) {
  const audioContext = useContext(AudioContext)
  const [track, setTrack] = useState<TrackHandle | null>(null)

  useEffect(() => {
    audioContext?.joinVc()

    const stream = streamResource(
      typeof src === 'string' && !isUrl(src)
        ? path.resolve(src)
        : src,
    )

    onStart?.()
    stream.on('end', () => onFinish?.())

    const track = audioContext?.mixer.playTrack(stream, paused) ?? null
    setTrack(track)

    return () => {
      if (track) {
        audioContext?.mixer.stopTrack(track)
      }
      setTrack(null)
    }
  }, [])

  useEffect(() => {
    if (track === null) {
      return
    }

    paused ? audioContext?.mixer.pauseTrack(track) : audioContext?.mixer.resumeTrack(track)
  }, [paused])

  return <></>
}

export function Emoji({ id }: { id: string }) {
  const interaction = useInteraction()
  const emoji = interaction.client.emojis.cache.get(id)

  if (emoji === undefined) {
    return <></>
  }

  return <Markdown>{emoji.toString()}</Markdown>
}

interface TimerProps {
  seconds: number
  onEnd?: () => void
}

export function Timer({ seconds, onEnd }: TimerProps) {
  useEffect(() => {
    const timeout = setTimeout(() => onEnd?.(), seconds * 1000)
    return () => clearTimeout(timeout)
  }, [])

  return time(new Date(Date.now() + seconds * 1000), TimestampStyles.RelativeTime)
}

export function Whitelist(props: PropsWithChildren<Partial<WhitelistProps>>) {
  const interaction = useInteraction()

  const newProps: WhitelistProps = {
    ...props,
    users: props.users ?? [interaction.user.id],
  }

  return (
    <Node props={newProps} createInstance={props => WhitelistInstance.createInstance(props)}>
      {props.children}
    </Node>
  )
}
