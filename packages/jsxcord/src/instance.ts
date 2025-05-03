import type { ColorLike } from 'color'
import type {
  APIMediaGalleryItem,
  APIMessageComponentEmoji,
  BaseMessageOptions,
  ButtonInteraction,
  InteractionButtonComponentData,
  InteractionReplyOptions,
  PollAnswerData,
  PollData,
  SelectMenuComponentOptionData,
  StringSelectMenuComponentData,
  StringSelectMenuInteraction,
} from 'discord.js'
import type { Container } from './container.js'
import Color from 'color'
import { BitField, ButtonStyle, ComponentType, escapeMarkdown, MessageFlags } from 'discord.js'
import { v4 as uuidv4 } from 'uuid'
import { shouldAttach } from './container.js'

type JsxcordInstanceType =
  | 'Accessory'
  | 'ActionRow'
  | 'Answer'
  | 'Base'
  | 'Button'
  | 'Container'
  | 'Divider'
  | 'Embed'
  | 'Emoji'
  | 'Empty'
  | 'Ephemeral'
  | 'Field'
  | 'File'
  | 'Gallery'
  | 'Image'
  | 'Markdown'
  | 'Option'
  | 'Poll'
  | 'Section'
  | 'Select'
  | 'Text'
  | 'Thumbnail'
  | 'Whitelist'

function formatType(type: JsxcordInstanceType) {
  return type === 'Text' ? 'text' : `\`<${type}>\``
}

function enforceType<Class extends { type: JsxcordInstanceType, new(data: any): unknown }>(
  instance: InstanceOrText,
  InstanceClass: Class | Class[],
): InstanceType<Class> {
  if (Array.isArray(InstanceClass)) {
    if (InstanceClass.some(Class => instance instanceof Class)) {
      return instance as InstanceType<Class>
    }
    else {
      throw new TypeError(
        `Expected one of ${InstanceClass.map(Class => formatType(Class.type)).join(', ')}, found ${formatType(instance.getType())}.`,
      )
    }
  }
  else {
    if (instance instanceof InstanceClass) {
      return instance as InstanceType<Class>
    }
    else {
      throw new TypeError(
        `Expected ${formatType(InstanceClass.type)}, found ${formatType(instance.getType())}.`,
      )
    }
  }
}

function textInstancesToString(instances: TextInstance[]) {
  return instances.map(instance => instance.data).join('')
}

function emojiToApiEmoji(emoji: string | EmojiInstance | undefined): APIMessageComponentEmoji | undefined {
  if (emoji === undefined) {
    return undefined
  }
  else if (typeof emoji === 'string') {
    return { name: emoji }
  }
  else {
    return {
      name: emoji.data.name ?? undefined,
      id: emoji.data.id,
    }
  }
}

abstract class BaseInstance<Data> {
  static type: JsxcordInstanceType = 'Base'
  public getType() {
    return (this.constructor as typeof BaseInstance<Data>).type
  }

  public isHidden = false

  constructor(public data: Data) {}
  abstract appendChild(child: InstanceOrText): void
  abstract removeChild(child: InstanceOrText): void
  abstract addToOptions(options: InteractionReplyOptions): void
  abstract addToOptionsV2(options: InteractionReplyOptions, container: Container): void
}

export interface AnswerProps {
  emoji?: string
}

// Used for things that get rendered, but don't correspond to
// anything visible
export class EmptyInstance extends BaseInstance<null> {
  static type: JsxcordInstanceType = 'Empty'

  static createInstance() {
    return new EmptyInstance(null)
  }

  appendChild() {}
  removeChild() {}
  addToOptions() {}
  addToOptionsV2() {}
}

export class AccessoryInstance extends BaseInstance<{ instance?: ButtonInstance | ImageInstance }> {
  static type: JsxcordInstanceType = 'Accessory'

  static createInstance() {
    return new AccessoryInstance({})
  }

  appendChild(child: InstanceOrText) {
    const enforcedChild = enforceType(
      child,
      [ButtonInstance, ImageInstance],
    )

    this.data = {
      ...this.data,
      instance: enforcedChild,
    }
  }

  removeChild(child: InstanceOrText) {
    if (this.data.instance === child) {
      this.data = {
        ...this.data,
        instance: undefined,
      }
    }
  }

  addToOptions() {}
  addToOptionsV2() {}
}

type ButtonStyleString = 'primary' | 'secondary' | 'success' | 'danger'

const buttonStyleMap: Record<string, Exclude<ButtonStyle, ButtonStyle.Link>> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
}

export class ActionRowInstance extends BaseInstance<{ components: (ButtonInstance | SelectInstance)[] }> {
  static type: JsxcordInstanceType = 'ActionRow'

  static createInstance() {
    return new ActionRowInstance({
      components: [],
    })
  }

  appendChild(child: InstanceOrText) {
    if (child.getType() !== 'Button' && child.getType() !== 'Select') {
      throw new Error('<ActionRow> can only contain <Button> and <Select> components')
    }

    this.data.components.push(enforceType(child, [ButtonInstance, SelectInstance]))
  }

  removeChild(child: InstanceOrText) {
    const index = this.data.components.indexOf(enforceType(child, [ButtonInstance, SelectInstance]))
    if (index !== -1) {
      this.data.components.splice(index, 1)
    }
  }

  addToOptionsGeneric(options: InteractionReplyOptions, v2: boolean) {
    if (this.data.components.length === 0) {
      return
    }

    const componentChunks: (ButtonInstance | SelectInstance)[][] = []
    let currentChunk: (ButtonInstance | SelectInstance)[] = []

    for (const component of this.data.components) {
      if (component instanceof SelectInstance) {
        // If we have existing buttons, push them as a chunk
        if (currentChunk.length > 0) {
          componentChunks.push([...currentChunk])
          currentChunk = []
        }
        // Each select goes in its own row
        componentChunks.push([component])
      }
      else {
        // For buttons, add to current chunk
        currentChunk.push(component)
        // If we've reached 5 buttons, push as a chunk and start new
        if (currentChunk.length === 5) {
          componentChunks.push([...currentChunk])
          currentChunk = []
        }
      }
    }

    // Push any remaining buttons
    if (currentChunk.length > 0) {
      componentChunks.push(currentChunk)
    }

    const actionRows = componentChunks.map(chunk => ({
      type: ComponentType.ActionRow,
      components: chunk.map(c => v2 ? c.toComponentV2JSON() : c.toComponentJSON()),
    }))

    options.components = [
      ...(options.components ?? []),
      ...actionRows,
    ]
  }

  addToOptions(options: InteractionReplyOptions) {
    this.addToOptionsGeneric(options, false)
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    this.addToOptionsGeneric(options, true)
  }
}

type InternalPollAnswerData = Omit<PollAnswerData, 'text'> & { texts: TextInstance[] }

export class AnswerInstance extends BaseInstance<InternalPollAnswerData> {
  static type: JsxcordInstanceType = 'Answer'

  static createInstance(props: AnswerProps) {
    return new AnswerInstance({
      texts: [],
      emoji: props.emoji,
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.texts.push(enforceType(child, TextInstance))
  }

  removeChild(child: InstanceOrText) {
    const index = this.data.texts.indexOf(enforceType(child, TextInstance))
    if (index !== -1) {
      this.data.texts.splice(index, 1)
    }
  }

  addToOptions() {
    throw new Error(
      'Attempted to add an <Answer> to a non-<Poll>. Ensure all <Answer> components are in a <Poll> component.',
    )
  }

  addToOptionsV2() {
    this.addToOptions()
  }
}

export interface ButtonProps {
  disabled?: boolean
  emoji?: string | EmojiInstance
  style?: ButtonStyleString
  onClick?: (interaction: ButtonInteraction) => void | Promise<void>
}

export class ButtonInstance extends BaseInstance<
  Omit<InteractionButtonComponentData, 'emoji' | 'label' | 'style'> & ButtonProps & { texts: TextInstance[] }
> {
  static type: JsxcordInstanceType = 'Button'

  static createInstance(props: ButtonProps) {
    return new ButtonInstance({
      type: ComponentType.Button,
      texts: [],
      style: props.style,
      customId: uuidv4(),
      disabled: props.disabled ?? false,
      emoji: props.emoji,
      onClick: props.onClick,
    })
  }

  appendChild(child: InstanceOrText) {
    const enforcedChild = enforceType(child, [EmojiInstance, TextInstance])

    if (enforcedChild instanceof EmojiInstance) {
      this.data.emoji = enforcedChild
    }
    else {
      this.data.texts.push(enforcedChild)
    }
  }

  removeChild(child: InstanceOrText) {
    const index = this.data.texts.indexOf(enforceType(child, TextInstance))
    if (index !== -1) {
      this.data.texts.splice(index, 1)
    }
  }

  toComponentJSON() {
    return {
      ...this.data,
      emoji: typeof this.data.emoji === 'string'
        ? this.data.emoji
        : `<:${this.data.emoji?.data.name}:${this.data.emoji?.data.id}>`,
      label: textInstancesToString(this.data.texts),
      style: buttonStyleMap[this.data.style ?? 'secondary'],
    }
  }

  toComponentV2JSON() {
    return {
      ...this.data,
      custom_id: this.data.customId,
      emoji: emojiToApiEmoji(this.data.emoji),
      label: textInstancesToString(this.data.texts),
      style: buttonStyleMap[this.data.style ?? 'secondary'],
    }
  }

  addToOptions(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [this.toComponentJSON()],
      },
    ]
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [this.toComponentV2JSON()],
      },
    ]
  }
}

export interface ContainerProps {
  color?: ColorLike
}

export class ContainerInstance extends BaseInstance<ContainerProps & { children: InstanceOrText[] }> {
  static type: JsxcordInstanceType = 'Container'

  static createInstance(props: ContainerProps) {
    return new ContainerInstance({
      ...props,
      children: [],
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.children = [...this.data.children, child]
  }

  removeChild(child: InstanceOrText) {
    this.data.children = this.data.children.filter(c => c !== child)
  }

  addToOptions() {
    throw new Error('Components v1 does not support <Container>. Use <Embed> instead.')
  }

  addToOptionsV2(options: InteractionReplyOptions, container: Container) {
    const children = { components: [], files: [] }

    for (const child of this.data.children) {
      child.addToOptionsV2(children, container)
    }

    options.files = [...(options.files ?? []), ...children.files]

    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.Container,
        accent_color: this.data.color ? Color(this.data.color).rgbNumber() : undefined,
        components: children.components,
      },
    ]
  }
}

export class DividerInstance extends BaseInstance<{ small?: boolean }> {
  static type: JsxcordInstanceType = 'Divider'

  static createInstance(props: { small?: boolean }) {
    return new DividerInstance(props)
  }

  appendChild() {
    throw new Error('<Divider> does not support children.')
  }

  removeChild() {
    throw new Error('<Divider> does not support children.')
  }

  addToOptions() {
    throw new Error('Components v1 does not support <Divider>.')
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.Separator,
        divider: true,
        spacing: this.data.small ? 1 : 2,
      },
    ]
  }
}

interface EmbedProps {
  color?: ColorLike
  description?: string
  title?: string
}

type EmbedData = Omit<EmbedProps, 'thumbnail'> & {
  image?: ImageInstance
  thumbnail?: ThumbnailInstance
  fields?: FieldInstance[]
}

export class EmbedInstance extends BaseInstance<EmbedData> {
  static type: JsxcordInstanceType = 'Embed'

  static createInstance(props: EmbedProps) {
    return new EmbedInstance(props)
  }

  appendChild(child: InstanceOrText) {
    const enforcedChild = enforceType(
      child,
      [ImageInstance, EmptyInstance, ThumbnailInstance, FieldInstance],
    )

    if (enforcedChild instanceof ImageInstance) {
      this.data = {
        ...this.data,
        image: enforcedChild,
      }
    }

    if (enforcedChild instanceof ThumbnailInstance) {
      this.data = {
        ...this.data,
        thumbnail: enforcedChild,
      }
    }

    if (enforcedChild instanceof FieldInstance) {
      this.data = {
        ...this.data,
        fields: [...(this.data.fields ?? []), enforcedChild],
      }
    }
  }

  removeChild(child: InstanceOrText) {
    const enforcedChild = enforceType(
      child,
      [ImageInstance, EmptyInstance, ThumbnailInstance, FieldInstance],
    )

    if (enforcedChild instanceof ImageInstance) {
      this.data = {
        ...this.data,
        image: undefined,
      }
    }

    if (enforcedChild instanceof ThumbnailInstance) {
      this.data = {
        ...this.data,
        thumbnail: undefined,
      }
    }

    if (enforcedChild instanceof FieldInstance) {
      this.data = {
        ...this.data,
        fields: this.data.fields?.filter(field => field !== enforcedChild),
      }
    }
  }

  addToOptions(options: InteractionReplyOptions) {
    if (this.data.image) {
      const { src } = this.data.image.data

      options.files = [
        ...(options.files ?? []),
        {
          name: 'embed_image.png',
          attachment: typeof src === 'string'
            ? src
            : Buffer.from(src),
        },
      ]
    }

    if (this.data.thumbnail?.data.image) {
      const { src } = this.data.thumbnail.data.image.data

      options.files = [
        ...(options.files ?? []),
        {
          name: 'embed_thumbnail.png',
          attachment: typeof src === 'string'
            ? src
            : Buffer.from(src),
        },
      ]
    }

    options.embeds = [
      ...(options.embeds ?? []),
      {
        color: Color(this.data.color).rgbNumber(),
        description: this.data.description,
        title: this.data.title,
        image: this.data.image ? { url: 'attachment://embed_image.png' } : undefined,
        thumbnail: this.data.thumbnail ? { url: 'attachment://embed_thumbnail.png' } : undefined,

        fields: this.data.fields?.map(field => ({
          name: field.data.name,
          value: field.data.children.map(child => child.asText()).join(''),
          inline: field.data.inline,
        })) ?? [],
      },
    ]
  }

  addToOptionsV2() {
    throw new Error('Components v2 does not support <Embed>. Use <Container> instead.')
  }
}

export class EmojiInstance extends BaseInstance<{ name: string | null, id: string }> {
  static type: JsxcordInstanceType = 'Emoji'

  static createInstance(props: { name: string | null, id: string }) {
    return new EmojiInstance(props)
  }

  appendChild() {
    throw new Error('<Emoji> does not support children.')
  }

  removeChild() {
    throw new Error('<Emoji> does not support children.')
  }

  addToOptions() {
    throw new Error('Components v1 does not support <Emoji>.')
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.TextDisplay,
        content: `<:${this.data.name}:${this.data.id}>`,
      },
    ]
  }
}

export class EphemeralInstance extends BaseInstance<{ children: InstanceOrText[] }> {
  static type: JsxcordInstanceType = 'Ephemeral'

  static createInstance() {
    return new EphemeralInstance({
      children: [],
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.children.push(child)
  }

  removeChild(child: InstanceOrText) {
    const index = this.data.children.indexOf(child)
    if (index !== -1) {
      this.data.children.splice(index, 1)
    }
  }

  addToOptions(options: InteractionReplyOptions) {
    for (const child of this.data.children) {
      child.addToOptions(options)
    }

    options.flags = new BitField(options.flags).add(MessageFlags.Ephemeral)
  }

  addToOptionsV2(options: InteractionReplyOptions, container: Container) {
    for (const child of this.data.children) {
      child.addToOptionsV2(options, container)
    }

    options.flags = new BitField(options.flags).add(MessageFlags.Ephemeral)
  }
}

interface FieldProps {
  name: string
  inline?: boolean
}

export class FieldInstance extends BaseInstance<FieldProps & { children: (InstanceOrText & { asText: () => string })[] }> {
  static type: JsxcordInstanceType = 'Field'

  static createInstance(props: FieldProps) {
    return new FieldInstance({ ...props, children: [] })
  }

  appendChild(child: InstanceOrText) {
    if (!('asText' in child)) {
      throw new Error('Cannot append a child to <Field> that cannot be converted to text.')
    }

    this.data.children.push(child)
  }

  removeChild(child: InstanceOrText) {
    this.data.children = this.data.children.filter(c => c !== child)
  }

  addToOptions() {
    throw new Error(
      'Attempted to add a <Field> to a non-<Embed>. Ensure all <Field> components are in an <Embed> component.',
    )
  }

  addToOptionsV2(_options: InteractionReplyOptions) {
    throw new Error('Not implemented')
  }
}

interface FileProps {
  name: string
  content: ArrayBuffer
}

export class FileInstance extends BaseInstance<FileProps> {
  static type: JsxcordInstanceType = 'File'

  static createInstance(props: FileProps) {
    return new FileInstance(props)
  }

  appendChild() {
    throw new Error('<File> does not support children.')
  }

  removeChild() {
    throw new Error('<File> does not support children.')
  }

  addToOptions(options: InteractionReplyOptions) {
    options.files = [
      ...(options.files ?? []),
      {
        name: this.data.name,
        attachment: Buffer.from(this.data.content),
      },
    ]
  }

  addToOptionsV2(_options: InteractionReplyOptions) {
    throw new Error('Not implemented')
  }
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] }

export class GalleryInstance extends BaseInstance<{ images: ImageInstance[] }> {
  static type: JsxcordInstanceType = 'Gallery'

  static createInstance() {
    return new GalleryInstance({ images: [] })
  }

  appendChild(child: InstanceOrText) {
    this.data.images.push(enforceType(child, ImageInstance))
  }

  removeChild(child: InstanceOrText) {
    this.data.images = this.data.images.filter(image => image !== child)
  }

  addToOptions() {
    throw new Error('Components v1 does not support <Gallery>.')
  }

  addToOptionsV2(options: InteractionReplyOptions, container: Container) {
    const mediaGalleryItems: APIMediaGalleryItem[] = []
    const files: Writeable<BaseMessageOptions['files']> = []

    this.data.images.forEach((image, index) => {
      const fileName = image.data.name ?? `gallery${index}.png`

      const attachment = {
        name: fileName,
        attachment: typeof image.data.src === 'string'
          ? image.data.src
          : Buffer.from(image.data.src),
      }

      if (shouldAttach(container, attachment)) {
        files.push(attachment)
      }

      mediaGalleryItems.push({
        media: { url: `attachment://${fileName}` },
        description: image.data.alt,
      })
    })

    if (files.length > 0) {
      options.files = [
        ...(options.files ?? []),
        ...files,
      ]
    }

    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.MediaGallery,
        items: mediaGalleryItems,
      },
    ]
  }
}

interface ImageProps {
  name?: string
  alt?: string
  src: string | ArrayBuffer
}

export class ImageInstance extends BaseInstance<ImageProps> {
  static type: JsxcordInstanceType = 'Image'

  static createInstance(props: ImageProps) {
    return new ImageInstance(props)
  }

  appendChild() {
    throw new Error('<Img> does not support children.')
  }

  removeChild() {
    throw new Error('<Img> does not support children.')
  }

  addToOptions(options: InteractionReplyOptions) {
    options.files = [
      ...(options.files ?? []),
      {
        name: this.data.name,
        attachment: typeof this.data.src === 'string'
          ? this.data.src
          : Buffer.from(this.data.src),
      },
    ]
  }

  addToOptionsV2(options: InteractionReplyOptions, container: Container) {
    const fileName = this.data.name ?? 'image.png'

    const attachment = {
      name: fileName,
      attachment: typeof this.data.src === 'string'
        ? this.data.src
        : Buffer.from(this.data.src),
    }

    if (shouldAttach(container, attachment)) {
      options.files = [
        ...(options.files ?? []),
        attachment,
      ]
    }

    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.MediaGallery,
        items: [
          {
            media: { url: `attachment://${fileName}` },
            description: this.data.alt,
          },
        ],
      },
    ]
  }
}

export class MarkdownInstance extends BaseInstance<{ texts: TextInstance[] }> {
  static type: JsxcordInstanceType = 'Markdown'

  static createInstance() {
    return new MarkdownInstance({ texts: [] })
  }

  appendChild(child: InstanceOrText) {
    this.data.texts.push(enforceType(child, TextInstance))
  }

  removeChild(child: InstanceOrText) {
    this.data.texts = this.data.texts.filter(text => text !== child)
  }

  addToOptions(options: InteractionReplyOptions) {
    options.content += textInstancesToString(this.data.texts)
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.TextDisplay,
        content: textInstancesToString(this.data.texts),
      },
    ]
  }

  asText() {
    return this.data.texts.map(text => text.asText()).join('')
  }
}

type InternalSelectMenuComponentOptionData =
  Omit<SelectMenuComponentOptionData, 'label' | 'value'> & {
    emoji?: string | EmojiInstance
    label: TextInstance[]
    value?: string
  }

interface OptionProps {
  description?: string
  default?: boolean
  emoji?: string
  value?: string
}

export class OptionInstance extends BaseInstance<
  InternalSelectMenuComponentOptionData
> {
  static type: JsxcordInstanceType = 'Option'

  static createInstance(props: OptionProps) {
    return new OptionInstance({
      description: props.description,
      label: [],
      default: props.default ?? false,
      emoji: props.emoji,
      value: props.value,
    })
  }

  appendChild(child: InstanceOrText) {
    const enforcedChild = enforceType(child, [EmojiInstance, TextInstance])

    if (enforcedChild instanceof EmojiInstance) {
      this.data.emoji = enforcedChild
    }
    else {
      this.data.label.push(enforcedChild)
    }
  }

  removeChild(child: InstanceOrText) {
    this.data.label = this.data.label.filter(text => text !== child)
  }

  addToOptions() {
    throw new Error(
      'Attempted to add an <Option> to a non-<Select>. Ensure all <Option> components are in a <Select> component.',
    )
  }

  addToOptionsV2() {
    this.addToOptions()
  }
}

export interface PollProps {
  question: string
}

export class PollInstance extends BaseInstance<
  Omit<PollData, 'answers'> & { answers: InternalPollAnswerData[] }
> {
  static type: JsxcordInstanceType = 'Poll'

  static createInstance(props: PollProps) {
    return new PollInstance({
      question: { text: props.question },
      answers: [],
      duration: 24,
      allowMultiselect: false,
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.answers = [
      ...this.data.answers,
      enforceType(child, AnswerInstance).data,
    ]
  }

  removeChild(child: InstanceOrText) {
    const enforcedChild = enforceType(child, AnswerInstance)
    this.data.answers = this.data.answers.filter(answer => answer !== enforcedChild.data)
  }

  addToOptions(options: InteractionReplyOptions) {
    options.poll = {
      ...this.data,
      answers: this.data.answers.map(answer => ({
        ...answer,
        text: textInstancesToString(answer.texts),
      })),
    }
  }

  addToOptionsV2(_options: InteractionReplyOptions) {
    throw new Error('Not implemented')
  }
}

interface SectionProps {}

type SectionData = Omit<SectionProps, 'accessory'> & {
  accessory?: AccessoryInstance
  children: (MarkdownInstance | TextInstance)[]
}

export class SectionInstance extends BaseInstance<SectionData> {
  static type: JsxcordInstanceType = 'Section'

  static createInstance() {
    return new SectionInstance({
      children: [],
    })
  }

  appendChild(child: InstanceOrText) {
    const enforcedChild = enforceType(child, [AccessoryInstance, MarkdownInstance, TextInstance])

    if (enforcedChild instanceof AccessoryInstance) {
      this.data.accessory = enforcedChild
    }
    else {
      this.data.children.push(enforcedChild)
    }
  }

  removeChild(child: InstanceOrText) {
    this.data.children = this.data.children.filter(text => text !== child)
  }

  addToOptions() {
    throw new Error('Components v1 does not support <Section>.')
  }

  addToOptionsV2(options: InteractionReplyOptions, container: Container) {
    // These are ANNOYING to type so I will leave them as `any` for now
    // because I am evil
    const children = { components: [] as any[] }
    const accessoryContainer = { components: [] as any[], files: [] }

    for (const child of this.data.children) {
      child.addToOptionsV2(children)
    }

    if (!this.data.accessory || !this.data.accessory.data.instance) {
      throw new Error('No <Accessory> found. This is a bug!')
    }

    this.data.accessory.data.instance.addToOptionsV2(accessoryContainer, container)
    options.files = [...options.files ?? [], ...accessoryContainer.files]
    let accessory = accessoryContainer.components[0]

    if (accessory.type === ComponentType.MediaGallery) {
      accessory = {
        ...accessory.items[0],
        type: ComponentType.Thumbnail,
      }
    }
    if (accessory.type === ComponentType.ActionRow) {
      accessory = accessory.components[0]
    }

    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.Section,
        accessory,
        components: children.components,
      },
    ]
  }
}

interface SelectProps {
  disabled?: boolean
  placeholder?: string
  onSelect?: (value: string, interaction: StringSelectMenuInteraction) => void | Promise<void>
}

export class SelectInstance extends BaseInstance<
  Omit<StringSelectMenuComponentData, 'options'> & SelectProps & { options: OptionInstance[] }
> {
  static type: JsxcordInstanceType = 'Select'

  static createInstance(props: SelectProps) {
    return new SelectInstance({
      type: ComponentType.StringSelect,
      options: [],
      customId: uuidv4(),
      disabled: props.disabled,
      placeholder: props.placeholder,
      onSelect: props.onSelect,
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.options.push(enforceType(child, OptionInstance))
  }

  removeChild(child: InstanceOrText) {
    this.data.options = this.data.options.filter(option => option !== child)
  }

  toComponentJSON() {
    return {
      ...this.data,
      options: this.data.options.map(option => ({
        ...option.data,
        emoji: typeof option.data.emoji === 'string'
          ? option.data.emoji
          : `<:${option.data.emoji?.data.name}:${option.data.emoji?.data.id}>`,
        label: textInstancesToString(option.data.label),
        value: option.data.value ?? textInstancesToString(option.data.label),
      })),
    }
  }

  toComponentV2JSON() {
    return {
      ...this.data,
      options: this.data.options.map(option => ({
        ...option.data,
        emoji: emojiToApiEmoji(option.data.emoji),
        label: textInstancesToString(option.data.label),
        value: option.data.value ?? textInstancesToString(option.data.label),
      })),
    }
  }

  addToOptions(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [this.toComponentJSON()],
      },
    ]
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [this.toComponentV2JSON()],
      },
    ]
  }
}

export class TextInstance extends BaseInstance<string> {
  static type: JsxcordInstanceType = 'Text'

  appendChild() {
    throw new Error('Attempted to append child to `TextInstance`. This is a bug!')
  }

  removeChild() {
    throw new Error('Attempted to remove child from `TextInstance`. This is a bug!')
  }

  addToOptions(options: InteractionReplyOptions) {
    // Escape all Markdown in text
    options.content += escapeMarkdown(this.data, {
      bulletedList: true,
      heading: true,
      maskedLink: true,
      numberedList: true,
    })
  }

  addToOptionsV2(options: InteractionReplyOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.TextDisplay,
        content: escapeMarkdown(this.data, {
          bulletedList: true,
          heading: true,
          maskedLink: true,
          numberedList: true,
        }),
      },
    ]
  }

  asText() {
    return this.data
  }
}

interface ThumbnailData {
  image?: ImageInstance
}

export class ThumbnailInstance extends BaseInstance<ThumbnailData> {
  static type: JsxcordInstanceType = 'Thumbnail'

  static createInstance() {
    return new ThumbnailInstance({})
  }

  appendChild(child: InstanceOrText) {
    const enforcedChild = enforceType(
      child,
      [ImageInstance, EmptyInstance],
    )

    if (enforcedChild instanceof ImageInstance) {
      this.data = {
        ...this.data,
        image: enforcedChild,
      }
    }
  }

  removeChild(child: InstanceOrText) {
    const enforcedChild = enforceType(
      child,
      [ImageInstance, EmptyInstance],
    )

    if (enforcedChild instanceof ImageInstance) {
      this.data = {
        ...this.data,
        image: undefined,
      }
    }
  }

  addToOptions() {}
  addToOptionsV2() {}
}

export interface WhitelistProps {
  users: string[]
}

export class WhitelistInstance extends BaseInstance<{
  users: string[]
  children: InstanceOrText[]
}> {
  static type: JsxcordInstanceType = 'Whitelist'

  static createInstance(props: WhitelistProps) {
    return new WhitelistInstance({
      users: props.users,
      children: [],
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.children = [...this.data.children, child]
  }

  removeChild(child: InstanceOrText) {
    this.data.children = this.data.children.filter(c => c !== child)
  }

  addToOptions(options: InteractionReplyOptions) {
    for (const child of this.data.children) {
      child.addToOptions(options)
    }
  }

  addToOptionsV2(options: InteractionReplyOptions, container: Container) {
    for (const child of this.data.children) {
      child.addToOptionsV2(options, container)
    }
  }
}

export type Instance =
  | AccessoryInstance
  | ActionRowInstance
  | AnswerInstance
  | ButtonInstance
  | DividerInstance
  | EmbedInstance
  | EmojiInstance
  | EmptyInstance
  | EphemeralInstance
  | FileInstance
  | FieldInstance
  | GalleryInstance
  | ImageInstance
  | MarkdownInstance
  | OptionInstance
  | PollInstance
  | SectionInstance
  | SelectInstance
  | ThumbnailInstance
  | WhitelistInstance
export type InstanceOrText = Instance | TextInstance
