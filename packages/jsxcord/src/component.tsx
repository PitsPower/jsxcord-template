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
import { useInteraction } from './index.js'
import {
  AccessoryInstance,
  ActionRowInstance,
  AnswerInstance,
  ButtonInstance,
  ContainerInstance,
  DividerInstance,
  EmbedInstance,
  EmojiInstance,
  EphemeralInstance,
  FieldInstance,
  FileInstance,
  GalleryInstance,
  ImageInstance,
  MarkdownInstance,
  OnlyContainerInstance,
  OnlyInstance,
  OptionInstance,
  PollInstance,
  SectionInstance,
  SelectInstance,
  ThumbnailInstance,
  WhitelistInstance,
} from './instance.js'
import { use } from './react.js'
import { AudioContext } from './root.js'

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

const Accessory = createComponent(AccessoryInstance)
const Thumbnail = createComponent(ThumbnailInstance)

export const ActionRow = createComponent(ActionRowInstance)
export const Answer = createComponent(AnswerInstance)
export const Container = createComponent(ContainerInstance)

const RawButton = createComponent(ButtonInstance)

export function Button(props: Omit<Parameters<typeof RawButton>[0], 'emoji'> & { emoji?: ReactNode }) {
  return (
    <RawButton {...props} emoji={typeof props.emoji === 'string' ? props.emoji : undefined}>
      {typeof props.emoji !== 'string' && props.emoji}
      {props.children}
    </RawButton>
  )
}

const RawEmbed = createComponent(EmbedInstance)

export function Embed(props: Parameters<typeof RawEmbed>[0] & { thumbnail?: ReactNode }) {
  return (
    <RawEmbed {...props}>
      {props.thumbnail && <Thumbnail>{props.thumbnail}</Thumbnail>}
      {props.children}
    </RawEmbed>
  )
}

const RawEmoji = createComponent(EmojiInstance)

export function Emoji({ name }: { name: string }) {
  const interaction = useInteraction()

  const emoji = interaction.client.application.emojis.cache.find(emoji => emoji.name === name)

  if (emoji === undefined) {
    return <></>
  }

  return <RawEmoji name={emoji.name} id={emoji.id} />
}

export const Ephemeral = createComponent(EphemeralInstance)
export const Field = createComponent(FieldInstance)
export const File = createComponent(FileInstance)
export const Gallery = createComponent(GalleryInstance)
export const Divider = createComponent(DividerInstance)

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
export const Only = createComponent(OnlyInstance)
export const OnlyContainer = createComponent(OnlyContainerInstance)

const RawOption = createComponent(OptionInstance)

export function Option(props: Omit<Parameters<typeof RawOption>[0], 'emoji'> & { emoji?: ReactNode }) {
  return (
    <RawOption {...props} emoji={typeof props.emoji === 'string' ? props.emoji : undefined}>
      {typeof props.emoji !== 'string' && props.emoji}
      {props.children}
    </RawOption>
  )
}

export const Poll = createComponent(PollInstance)

const RawSection = createComponent(SectionInstance)

export function Section(props: Parameters<typeof RawSection>[0] & { accessory?: ReactNode }) {
  return (
    <RawSection>
      {props.accessory && <Accessory>{props.accessory}</Accessory>}
      {props.children}
    </RawSection>
  )
}

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

export interface AudioProps {
  src: string | Buffer | Readable | ReadableStream | NodeJS.ReadableStream
  onStart?: () => void
  onFinish?: () => void
  paused?: boolean
  volume?: number
  ffmpeg?: { inputArgs?: string }
}

export function Audio({ src, onStart, onFinish, paused, volume, ffmpeg }: AudioProps) {
  const audioContext = useContext(AudioContext)
  const [track, setTrack] = useState<TrackHandle | null>(null)

  useEffect(() => {
    audioContext?.joinVc()

    const stream = streamResource(
      typeof src === 'string' && !isUrl(src)
        ? path.resolve(src)
        : src,
      ffmpeg,
    )

    const track = audioContext?.mixer.playTrack(stream, paused) ?? null
    setTrack(track)

    if (track) {
      audioContext?.mixer.setTrackVolume(track, volume ?? 1)
    }

    onStart?.()
    if (track && onFinish) {
      audioContext?.mixer.onTrackEnd(track, onFinish)
    }

    return () => {
      if (track) {
        if (onFinish) {
          audioContext?.mixer.offTrackEnd(track, onFinish)
        }
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

  useEffect(() => {
    if (track) {
      audioContext?.mixer.setTrackVolume(track, volume ?? 1)
    }
  }, [volume])

  return <></>
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
