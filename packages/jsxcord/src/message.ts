import type { InteractionReplyOptions, Message } from 'discord.js'
import { ComponentType } from 'discord.js'
import type { Container } from './container.js'
import type { Instance, InstanceOrText } from './instance.js'
import {
    ActionRowInstance,
    ButtonInstance,
    EmbedInstance,
    EmptyInstance,
    EphemeralInstance,
    FileInstance,
    ImageInstance,
    MarkdownInstance,
    PollInstance,
    SelectInstance,
    TextInstance,
    WhitelistInstance,
} from './instance.js'

const UNRENDERED_MESSAGE_PARTS = [
  EmptyInstance,
  EphemeralInstance,
  WhitelistInstance,
]

const MESSAGE_PARTS = [
  [MarkdownInstance, TextInstance],
  [FileInstance, ImageInstance],
  [EmbedInstance],
  [PollInstance],
  [ActionRowInstance, ButtonInstance, SelectInstance],
]

// Instances that should be their own message
const MESSAGE_CONTAINERS = [EphemeralInstance]

export function createMessageOptions(container: Container): InteractionReplyOptions[] {
  let currentMessageStage = 0
  let currentOptions: InteractionReplyOptions = {
    content: '',
    components: [],
    embeds: [],
    files: [],
  }
  const result = [currentOptions]

  function createNewMessage() {
    currentMessageStage = 0
    currentOptions = {
      content: '',
      components: [],
      embeds: [],
      files: [],
    }
    result.push(currentOptions)
  }

  for (const child of container.children) {
    if (child.isHidden) {
      continue
    }

    while (true) {
      const isMessageContainer = MESSAGE_CONTAINERS.some(container => child instanceof container)
      if (isMessageContainer) {
        createNewMessage()
      }

      const possibleInstances = [
        ...UNRENDERED_MESSAGE_PARTS,
        ...MESSAGE_PARTS[currentMessageStage],
      ]
      if (possibleInstances.some(InstanceClass => child instanceof InstanceClass)) {
        child.addToOptions(currentOptions)
        break
      }

      currentMessageStage += 1
      if (currentMessageStage >= MESSAGE_PARTS.length || isMessageContainer) {
        createNewMessage()
      }
    }
  }

  return result.filter(options => !isMessageOptionsEmpty(options))
}

interface InstanceWithWhitelist<I extends Instance> {
  instance: I
  users?: string[]
}

function findComponentWithId<I extends ButtonInstance | SelectInstance>(
  Class: new (...args: any[]) => I,
  children: InstanceOrText[],
  id: string,
  users?: string[],
): InstanceWithWhitelist<I> | undefined {
  for (const child of children) {
    if (child instanceof Class && child.data.customId === id) {
      return {
        instance: child,
        users,
      }
    }

    if (child instanceof ActionRowInstance) {
      const component = findComponentWithId(Class, child.data.components, id, users)
      if (component !== undefined) {
        return component
      }
    }

    if (child instanceof EphemeralInstance) {
      const component = findComponentWithId(Class, child.data.children, id, users)
      if (component !== undefined) {
        return component
      }
    }

    if (child instanceof WhitelistInstance) {
      const component = findComponentWithId(Class, child.data.children, id, child.data.users)
      if (component !== undefined) {
        return component
      }
    }
  }
}

export function hydrateMessages(messages: Message[], container: Container) {
  for (const message of messages) {
    for (const actionRow of message.components) {
      for (const component of actionRow.components) {
        if (
          component.customId === null
          || container.hydratedIds.includes(component.customId)
        ) {
          continue
        }

        switch (component.type) {
          case ComponentType.Button: {
            const collector = message.createMessageComponentCollector({
              componentType: ComponentType.Button,
            })

            collector.on('collect', (interaction) => {
              if (component.customId === null || interaction.customId !== component.customId) {
                return
              }

              const button = findComponentWithId(ButtonInstance, container.children, component.customId)
              const onClick = button?.instance.data.onClick
              const allowedUsers = button?.users

              if (
                onClick === undefined
                || (allowedUsers !== undefined && !allowedUsers.includes(interaction.user.id))
              ) {
                return
              }

              void interaction.deferUpdate()
              onClick(interaction)
            })

            container.hydratedIds.push(component.customId)

            break
          }

          case ComponentType.StringSelect: {
            const collector = message.createMessageComponentCollector({
              componentType: ComponentType.StringSelect,
            })

            collector.on('collect', (interaction) => {
              if (component.customId === null || interaction.customId !== component.customId) {
                return
              }

              const select = findComponentWithId(SelectInstance, container.children, component.customId)
              const onSelect = select?.instance.data.onSelect
              const allowedUsers = select?.users

              if (
                onSelect === undefined
                || (allowedUsers !== undefined && !allowedUsers.includes(interaction.user.id))
              ) {
                return
              }

              void interaction.deferUpdate()

              onSelect(interaction.values[0], interaction)
            })

            container.hydratedIds.push(component.customId)

            break
          }

          case ComponentType.UserSelect: { throw new Error('Not implemented yet: ComponentType.UserSelect case') }
          case ComponentType.RoleSelect: { throw new Error('Not implemented yet: ComponentType.RoleSelect case') }
          case ComponentType.MentionableSelect: { throw new Error('Not implemented yet: ComponentType.MentionableSelect case') }
          case ComponentType.ChannelSelect: { throw new Error('Not implemented yet: ComponentType.ChannelSelect case') }
        }
      }
    }
  }
}

export function isMessageOptionsEmpty(options: InteractionReplyOptions) {
  // TODO: Add more stuff here
  return (options.content === undefined || options.content.trim() === '')
    && (!options.components || options.components.length === 0)
    && (!options.embeds || options.embeds.length === 0)
    && (!options.files || options.files.length === 0)
}
