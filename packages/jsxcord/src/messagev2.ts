import type { Component, InteractionReplyOptions, Message } from 'discord.js'
import type { Container } from './container.js'
import type { Instance, InstanceOrText } from './instance.js'
import {
  ActionRow,
  ButtonComponent,
  ChannelSelectMenuComponent,
  ComponentType,
  ContainerComponent,
  MentionableSelectMenuComponent,
  MessageFlags,
  RoleSelectMenuComponent,
  SectionComponent,
  StringSelectMenuComponent,
  UserSelectMenuComponent,
} from 'discord.js'
import {
  AccessoryInstance,
  ActionRowInstance,
  ButtonInstance,
  ContainerInstance,
  EphemeralInstance,
  OnlyContainerInstance,
  OnlyInstance,
  OptionInstance,
  SectionInstance,
  SelectInstance,
  WhitelistInstance,
} from './instance.js'

type Writeable<T> = { -readonly [P in keyof T]: Writeable<T[P]> }

export function createMessageOptions(container: Container): InteractionReplyOptions[] {
  const currentOptions: Writeable<InteractionReplyOptions> = {
    components: [],
    flags: MessageFlags.IsComponentsV2,
  }
  const result = [currentOptions]

  for (const child of container.children) {
    if (child.isHidden) {
      continue
    }

    child.addToOptionsV2(currentOptions as InteractionReplyOptions, container)
  }

  if (currentOptions.files && currentOptions.files.length > 0) {
    for (const [name, attachment] of Object.entries(container.attachments)) {
      if (!currentOptions.files.find(file => (file as { name: string }).name === name)) {
        currentOptions.files.push({ name, attachment })
      }
    }
  }

  return result as InteractionReplyOptions[]
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

    if (child instanceof AccessoryInstance && child.data.instance) {
      const component = findComponentWithId(Class, [child.data.instance], id, users)
      if (component !== undefined) {
        return component
      }
    }

    if (child instanceof ActionRowInstance) {
      const component = findComponentWithId(Class, child.data.components, id, users)
      if (component !== undefined) {
        return component
      }
    }

    if (
      child instanceof ContainerInstance
      || child instanceof EphemeralInstance
      || child instanceof OnlyInstance
      || child instanceof OnlyContainerInstance
    ) {
      const component = findComponentWithId(Class, child.data.children, id, users)
      if (component !== undefined) {
        return component
      }
    }

    if (child instanceof SectionInstance && child.data.accessory) {
      const component = findComponentWithId(Class, [child.data.accessory], id, users)
      if (component !== undefined) {
        return component
      }
    }

    if (child instanceof SelectInstance) {
      const component = findComponentWithId(Class, child.data.options, id, users)
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

function hydrateComponent(component: Component, message: Message, container: Container) {
  if (component instanceof ActionRow || component instanceof ContainerComponent) {
    for (const innerComponent of component.components) {
      hydrateComponent(innerComponent, message, container)
    }
  }
  else if (component instanceof SectionComponent) {
    if (component.accessory) {
      hydrateComponent(component.accessory, message, container)
    }
  }
  else if (
    component instanceof ButtonComponent
    || component instanceof StringSelectMenuComponent
    || component instanceof UserSelectMenuComponent
    || component instanceof RoleSelectMenuComponent
    || component instanceof MentionableSelectMenuComponent
    || component instanceof ChannelSelectMenuComponent
  ) {
    if (!component.customId || container.hydratedIds.includes(component.customId)) {
      return
    }

    switch (component.type) {
      case ComponentType.Button: {
        const collector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
        })

        collector.on('collect', async (interaction) => {
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

          await onClick(interaction)
          try {
            await interaction.deferUpdate()
          }
          catch {}
        })

        container.hydratedIds.push(component.customId)

        break
      }

      case ComponentType.StringSelect: {
        const collector = message.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
        })

        collector.on('collect', async (interaction) => {
          if (component.customId === null || interaction.customId !== component.customId) {
            return
          }

          const select = findComponentWithId(SelectInstance, container.children, component.customId)
          const onSelect = select?.instance.data.onSelect

          const onSelectOption = select?.instance.data.options.find(
            (o): o is OptionInstance => o instanceof OptionInstance && o.data.value === interaction.values[0],
          )?.data.onSelect

          const allowedUsers = select?.users

          if (
            (onSelect === undefined && onSelectOption === undefined)
            || (allowedUsers !== undefined && !allowedUsers.includes(interaction.user.id))
          ) {
            return
          }

          await Promise.all([
            onSelect?.(interaction.values[0], interaction),
            onSelectOption?.(interaction),
          ])

          try {
            await interaction.deferUpdate()
          }
          catch {}
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

export function hydrateMessages(messages: Message[], container: Container) {
  for (const message of messages) {
    for (const component of message.components) {
      hydrateComponent(component, message, container)
    }
  }
}

export function isMessageOptionsEmpty(options: InteractionReplyOptions) {
  return !options.components || options.components.length === 0
}
