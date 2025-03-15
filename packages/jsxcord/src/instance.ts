import type { ColorLike } from 'color'
import type {
  ButtonInteraction,
  InteractionButtonComponentData,
  MessageCreateOptions,
  PollAnswerData,
  PollData,
  SelectMenuComponentOptionData,
  StringSelectMenuComponentData,
  StringSelectMenuInteraction,
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
  | 'Option'
  | 'Poll'
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

abstract class BaseInstance<Data> {
  static type: JsxcordInstanceType = 'Base'
  public getType() {
    return (this.constructor as typeof BaseInstance<Data>).type
  }

  public isHidden = false

  constructor(public data: Data) {}
  abstract appendChild(child: InstanceOrText): void
  abstract removeChild(child: InstanceOrText): void
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

  removeChild() {

  }

  addToOptions() {

  }
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
      throw new Error('ActionRow can only contain Button and Select components')
    }

    this.data.components.push(enforceType(child, [ButtonInstance, SelectInstance]))
  }

  removeChild(child: InstanceOrText) {
    const index = this.data.components.indexOf(enforceType(child, [ButtonInstance, SelectInstance]))
    if (index !== -1) {
      this.data.components.splice(index, 1)
    }
  }

  addToOptions(options: MessageCreateOptions) {
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
      components: chunk.map(c => c.toComponentJSON()),
    }))

    options.components = [
      ...(options.components ?? []),
      ...actionRows,
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

  removeChild(child: InstanceOrText) {
    const index = this.data.texts.indexOf(enforceType(child, TextInstance))
    if (index !== -1) {
      this.data.texts.splice(index, 1)
    }
  }

  addToOptions() {
    throw new Error(
      'Attempted to add `AnswerInstance` to message options. Ensure all `Answer` components are in a `Poll` component.',
    )
  }
}

export interface ButtonProps {
  disabled?: boolean
  emoji?: string | MarkdownInstance
  style?: ButtonStyleString
  onClick?: (interaction: ButtonInteraction) => void
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
    const enforcedChild = enforceType(child, [MarkdownInstance, TextInstance])

    if (enforcedChild instanceof MarkdownInstance) {
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
      emoji: typeof this.data.emoji === 'string' ? this.data.emoji : this.data.emoji?.asText(),
      label: textInstancesToString(this.data.texts),
      style: buttonStyleMap[this.data.style ?? 'secondary'],
    }
  }

  addToOptions(options: MessageCreateOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [this.toComponentJSON()],
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

  removeChild(child: InstanceOrText) {
    this.data.children = this.data.children.filter(c => c !== child)
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

  removeChild() {
    throw new Error('Cannot remove a child from `File`.')
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
  name?: string
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

  removeChild() {
    throw new Error('Cannot remove a child from `Image`.')
  }

  addToOptions(options: MessageCreateOptions) {
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

  addToOptions(options: MessageCreateOptions) {
    options.content += textInstancesToString(this.data.texts)
  }

  asText() {
    return this.data.texts.map(text => text.asText()).join('')
  }
}

type InternalSelectMenuComponentOptionData =
  Omit<SelectMenuComponentOptionData, 'label' | 'value'> & {
    emoji?: string | MarkdownInstance
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
    const enforcedChild = enforceType(child, [MarkdownInstance, TextInstance])

    if (enforcedChild instanceof MarkdownInstance) {
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
      'Attempted to add `OptionInstance` to message options. Ensure all `Option` components are in a `Select` component.',
    )
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

interface SelectProps {
  disabled?: boolean
  placeholder?: string
  onSelect?: (value: string, interaction: StringSelectMenuInteraction) => void
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
        emoji: typeof option.data.emoji === 'string' ? option.data.emoji : option.data.emoji?.asText(),
        label: textInstancesToString(option.data.label),
        value: option.data.value ?? textInstancesToString(option.data.label),
      })),
    }
  }

  addToOptions(options: MessageCreateOptions) {
    options.components = [
      ...(options.components ?? []),
      {
        type: ComponentType.ActionRow,
        components: [this.toComponentJSON()],
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

  removeChild(child: InstanceOrText) {
    this.data.children = this.data.children.filter(c => c !== child)
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
  | OptionInstance
  | PollInstance
  | SelectInstance
  | ThumbnailInstance
  | WhitelistInstance
export type InstanceOrText = Instance | TextInstance
