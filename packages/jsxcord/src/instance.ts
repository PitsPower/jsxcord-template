import type { ColorLike } from 'color'
import type {
  ButtonInteraction,
  InteractionButtonComponentData,
  MessageCreateOptions,
  PollAnswerData,
  PollData,
} from 'discord.js'
import Color from 'color'
import { ButtonStyle, ComponentType, escapeMarkdown } from 'discord.js'
import { v4 as uuidv4 } from 'uuid'

type JsxcordInstanceType =
  | 'ActionRow'
  | 'Answer'
  | 'Base'
  | 'Button'
  | 'Embed'
  | 'Empty'
  | 'Field'
  | 'File'
  | 'Image'
  | 'Markdown'
  | 'Poll'
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

abstract class BaseInstance<Data> {
  static type: JsxcordInstanceType = 'Base'
  public getType() {
    return (this.constructor as typeof BaseInstance<Data>).type
  }

  public isHidden = false

  constructor(public data: Data) {}
  abstract appendChild(child: InstanceOrText): void
  abstract addToOptions(options: MessageCreateOptions): void
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

  appendChild() {

  }

  addToOptions() {

  }
}

export class ActionRowInstance extends BaseInstance<{ components: (ButtonInstance)[] }> {
  static type: JsxcordInstanceType = 'ActionRow'

  static createInstance() {
    return new ActionRowInstance({
      components: [],
    })
  }

  appendChild(child: InstanceOrText) {
    if (child.getType() !== 'Button') {
      throw new Error('ActionRow can only contain Button components')
    }

    this.data.components.push(enforceType(child, ButtonInstance))
  }

  addToOptions(options: MessageCreateOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: this.data.components.map(c => ({
          ...c.data,
          label: textInstancesToString(c.data.texts),
        })),
      },
    ]
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

  addToOptions() {
    throw new Error(
      'Attempted to add `AnswerInstance` to message options. Ensure all `Answer` components are in a `Poll` component.',
    )
  }
}

type ButtonStyleString = 'primary' | 'secondary' | 'success' | 'danger'

const buttonStyleMap: Record<string, Exclude<ButtonStyle, ButtonStyle.Link>> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
}

export interface ButtonProps {
  disabled?: boolean
  emoji?: string
  style?: ButtonStyleString
  onClick?: (interaction: ButtonInteraction) => void
}

export class ButtonInstance extends BaseInstance<
  Omit<InteractionButtonComponentData, 'label'> & Omit<ButtonProps, 'style'> & { texts: TextInstance[] }
> {
  static type: JsxcordInstanceType = 'Button'

  static createInstance(props: ButtonProps) {
    return new ButtonInstance({
      type: ComponentType.Button,
      texts: [],
      style: buttonStyleMap[props.style ?? 'secondary'],
      customId: uuidv4(),
      disabled: props.disabled ?? false,
      emoji: props.emoji,
      onClick: props.onClick,
    })
  }

  appendChild(child: InstanceOrText) {
    this.data.texts.push(enforceType(child, TextInstance))
  }

  addToOptions(options: MessageCreateOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [{
          ...this.data,
          label: textInstancesToString(this.data.texts),
        }],
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

  addToOptions(options: MessageCreateOptions) {
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
      throw new Error('Cannot append a child to `Field` that cannot be converted to text.')
    }

    this.data.children.push(child)
  }

  addToOptions() {
    throw new Error(
      'Attempted to add `FieldInstance` to message options. Ensure all `Field` components are in an `Embed` component.',
    )
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
    throw new Error('Cannot append a child to `File`.')
  }

  addToOptions(options: MessageCreateOptions) {
    options.files = [
      ...(options.files ?? []),
      {
        name: this.data.name,
        attachment: Buffer.from(this.data.content),
      },
    ]
  }
}

interface ImageProps {
  src: string | ArrayBuffer
}

export class ImageInstance extends BaseInstance<ImageProps> {
  static type: JsxcordInstanceType = 'Image'

  static createInstance(props: ImageProps) {
    return new ImageInstance(props)
  }

  appendChild() {
    throw new Error('Cannot append a child to `Image`.')
  }

  addToOptions(options: MessageCreateOptions) {
    options.files = [
      ...(options.files ?? []),
      {
        attachment: typeof this.data.src === 'string'
          ? this.data.src
          : Buffer.from(this.data.src),
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

  addToOptions(options: MessageCreateOptions) {
    options.content += textInstancesToString(this.data.texts)
  }

  asText() {
    return this.data.texts.map(text => text.asText()).join('')
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

  addToOptions(options: MessageCreateOptions) {
    options.poll = {
      ...this.data,
      answers: this.data.answers.map(answer => ({
        ...answer,
        text: textInstancesToString(answer.texts),
      })),
    }
  }
}

export class TextInstance extends BaseInstance<string> {
  static type: JsxcordInstanceType = 'Text'

  appendChild() {
    throw new Error('Attempted to append child to `TextInstance`. This is a bug!')
  }

  addToOptions(options: MessageCreateOptions) {
    // Escape all Markdown in text
    options.content += escapeMarkdown(this.data, {
      bulletedList: true,
      heading: true,
      maskedLink: true,
      numberedList: true,
    })
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

  addToOptions() {

  }
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

  addToOptions(options: MessageCreateOptions) {
    for (const child of this.data.children) {
      child.addToOptions(options)
    }
  }
}

export type Instance =
  | ActionRowInstance
  | AnswerInstance
  | ButtonInstance
  | EmbedInstance
  | EmptyInstance
  | FileInstance
  | FieldInstance
  | ImageInstance
  | MarkdownInstance
  | PollInstance
  | ThumbnailInstance
  | WhitelistInstance
export type InstanceOrText = Instance | TextInstance
