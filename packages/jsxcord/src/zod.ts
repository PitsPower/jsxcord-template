import type { ApplicationCommandOptionBase, ChatInputCommandInteraction, ModalActionRowComponentBuilder, ModalBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder } from 'discord.js'
import type { ReactNode } from 'react'
import { ActionRowBuilder, Attachment, GuildMember, TextInputBuilder, TextInputStyle } from 'discord.js'
import { z } from 'zod'

export { z }

export type AutocompleteFunction = (query: string) => Promise<{
  name: string
  value: string
}[]>

declare module 'zod' {
  export interface ZodString {
    _autocompleteFunc?: AutocompleteFunction
    autocomplete: (func: AutocompleteFunction) => ZodString

    _long?: boolean
    long: () => ZodString

    _placeholder?: string
    placeholder: (placeholder: string) => ZodString
  }
}

z.ZodString.prototype.autocomplete = function (this: z.ZodString, func) {
  this._autocompleteFunc = func
  return this
}

z.ZodString.prototype.long = function (this: z.ZodString) {
  this._long = true
  return this
}

z.ZodString.prototype.placeholder = function (this: z.ZodString, placeholder) {
  this._placeholder = placeholder
  return this
}

/** Creates a custom ZodType from a class */
// This is needed instead of just `z.custom` as it gives us a class
// that we can do `instanceof` on
function customZodType<T>(type: { new(...args: any[]): T }) {
  const schema = z.custom<T>(val => val instanceof type)
  return class extends z.ZodType<T> {
    _parse(input: z.ParseInput): z.ParseReturnType<T> {
      return schema._parse(input)
    }
  }
}

// @ts-expect-error: Class has a protected constructor, but we don't care
const DiscordMemberType = customZodType(GuildMember)
// @ts-expect-error: Class has a protected constructor, but we don't care
const DiscordAttachmentType = customZodType(Attachment)

/** Custom zod types for Discord arguments */
export const discord = {
  attachment: () => new DiscordAttachmentType({}),
  member: () => new DiscordMemberType({}),
}

export function buildZodTypeForModal(
  builder: ModalBuilder,
  key: string,
  value: any,
  augmentTextInputFuncs: (<T extends ModalActionRowComponentBuilder>(option: T) => T)[] = [],
) {
  if (!(value instanceof z.ZodType))
    throw new TypeError('Unhandled type in command options. This is a bug!')

  /** Adds the name, description, etc. */
  const augmentTextInput = <T extends ModalActionRowComponentBuilder>(builder: T): T => {
    builder = builder.setCustomId(key)
    builder = builder.setLabel(value.description ?? (key[0].toUpperCase() + key.slice(1)))

    if (!value.isOptional()) {
      builder = builder.setRequired(true)
    }

    for (const func of augmentTextInputFuncs) {
      builder = func(builder)
    }

    return builder
  }

  if (value instanceof z.ZodString) {
    let textInput = new TextInputBuilder()
      .setStyle(value._long ? TextInputStyle.Paragraph : TextInputStyle.Short)

    if (value.minLength) {
      textInput = textInput.setMinLength(value.minLength)
    }
    if (value.maxLength) {
      textInput = textInput.setMaxLength(value.maxLength)
    }

    if (value._placeholder !== undefined) {
      textInput = textInput.setPlaceholder(value._placeholder)
    }

    const augmentedTextInput = augmentTextInput(textInput)

    const actionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>()
      .addComponents(augmentedTextInput)

    builder.addComponents(actionRow)
  }
  else if (value instanceof z.ZodOptional || value instanceof z.ZodDefault) {
    const augmentations: (<T extends ModalActionRowComponentBuilder>(option: T) => T)[] = [
      augmentTextInput,
      option => option.setRequired(false),
    ]

    if (value instanceof z.ZodDefault) {
      augmentations.push(option => option.setValue(value._def.defaultValue()))
    }

    buildZodTypeForModal(builder, key, value._def.innerType, augmentations)
  }
  else if (value instanceof z.ZodEffects) {
    buildZodTypeForModal(builder, key, value.innerType(), [augmentTextInput])
  }
  else {
    throw new TypeError('Unhandled type in modal options.')
  }
}

/** Given the Zod type, calls the relevant slash command builder methods */
export function buildZodTypeForCommand(
  builder: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandBuilder,
  key: string,
  value: any,
  augmentOptionFuncs: (<T extends ApplicationCommandOptionBase>(option: T) => T)[] = [],
) {
  if (!(value instanceof z.ZodType))
    throw new TypeError('Unhandled type in command options. This is a bug!')

  /** Adds the name, description, etc. */
  const augmentOption = <T extends ApplicationCommandOptionBase>(option: T): T => {
    option = option.setName(key)
    option = option.setDescription(value.description ?? 'No description')

    if (!value.isOptional()) {
      option = option.setRequired(true)
    }

    for (const func of augmentOptionFuncs) {
      option = func(option)
    }

    return option
  }

  if (value instanceof z.ZodString) {
    builder.addStringOption((option) => {
      option = augmentOption(option)

      if (value.minLength) {
        option = option.setMinLength(value.minLength)
      }
      if (value.maxLength) {
        option = option.setMaxLength(value.maxLength)
      }

      if (value._autocompleteFunc !== undefined) {
        option = option.setAutocomplete(true)
      }

      return option
    })
  }
  else if (value instanceof z.ZodBoolean) {
    builder.addBooleanOption(augmentOption)
  }
  else if (value instanceof z.ZodNumber) {
    if (value.isInt) {
      builder.addIntegerOption((option) => {
        option = augmentOption(option)

        if (value.minValue !== null) {
          option = option.setMinValue(value.minValue)
        }
        if (value.maxValue !== null) {
          option = option.setMaxValue(value.maxValue)
        }

        return option
      })
    }
    else {
      builder.addNumberOption((option) => {
        option = augmentOption(option)

        if (value.minValue !== null) {
          option = option.setMinValue(value.minValue)
        }
        if (value.maxValue !== null) {
          option = option.setMaxValue(value.maxValue)
        }

        return option
      })
    }
  }
  else if (value instanceof z.ZodEnum) {
    builder.addStringOption((option) => {
      option = augmentOption(option)

      const choices = z.string().array().parse(value.options)
      option = option.setChoices(...choices.map(o => ({ name: o, value: o })))

      return option
    })
  }
  else if (value instanceof DiscordMemberType) {
    builder.addUserOption(augmentOption)
  }
  else if (value instanceof DiscordAttachmentType) {
    builder.addAttachmentOption(augmentOption)
  }
  else if (value instanceof z.ZodOptional || value instanceof z.ZodDefault) {
    buildZodTypeForCommand(builder, key, value._def.innerType, [
      augmentOption,
      option => option.setRequired(false),
    ])
  }
  else if (value instanceof z.ZodEffects) {
    buildZodTypeForCommand(builder, key, value.innerType(), [augmentOption])
  }
  else {
    throw new TypeError('Unhandled type in command options. This is a bug!')
  }
}

/** Convert Discord.js command options to an object */
export function getOptionsAsObject(options: ChatInputCommandInteraction['options']) {
  return Object.fromEntries(
    // Hack: options.data only contains options for parent command,
    // access private _hoistedOptions instead to get all options (including subcommands)

    ((options as any)._hoistedOptions as ChatInputCommandInteraction['options']['data'])
      .map(option => [option.name, option.attachment ?? option.member ?? option.value]),
  )
}

type ComponentFunc<T extends z.ZodRawShape> = (props: z.infer<z.ZodObject<T>>) => ReactNode

export interface ZodCommand<
  T extends z.ZodRawShape,
  HasComponent extends boolean,
  HasSubcommands extends boolean,
> {
  _schema: z.ZodObject<T>
  _componentFunc: HasComponent extends true ? ComponentFunc<T> : null
  _subcommands: HasSubcommands extends true ? Record<string, ZodCommand<z.ZodRawShape, true, false>> : null

  component: (this: ZodCommand<T, false, false>, componentFunc: ComponentFunc<T>) => ZodCommand<z.ZodRawShape, true, false>
  sub: (this: ZodCommand<T, false, false>, subcommands: Record<string, ZodCommand<z.ZodRawShape, true, false>>) => ZodCommand<z.ZodRawShape, false, true>
}

export function command<T extends z.ZodRawShape>(options?: string | z.ZodObject<T>): ZodCommand<T, false, false> {
  let schema = z.object({}) as z.ZodObject<T>
  if (typeof options === 'string') {
    schema = schema.describe(options)
  }
  else if (options) {
    schema = options
  }

  return {
    _schema: schema,
    _componentFunc: null,
    _subcommands: null,

    component(componentFunc) {
      const newResult = this as unknown as ZodCommand<z.ZodRawShape, true, false>
      newResult._componentFunc = componentFunc as ComponentFunc<z.ZodRawShape>
      return newResult
    },

    sub(subcommands) {
      const newResult = this as unknown as ZodCommand<z.ZodRawShape, false, true>
      newResult._subcommands = subcommands
      return newResult
    },
  }
}
