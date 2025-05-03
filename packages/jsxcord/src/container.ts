import type { Client } from 'discord.js'
import type { InstanceOrText } from './instance.js'

export interface Container {
  attachments: Record<string, string | Buffer>
  client: Client
  children: InstanceOrText[]
  hydratedIds: string[]
  onChange?: () => Promise<void>
}

export function create(client: Client): Container {
  return {
    attachments: {},
    client,
    children: [],
    hydratedIds: [],
  }
}

export function shouldAttach(
  container: Container,
  { name, attachment }: { name: string, attachment: string | Buffer },
) {
  const cachedAttachment = container.attachments[name]

  if (typeof cachedAttachment === 'string' && typeof attachment === 'string' && cachedAttachment === attachment) {
    return false
  }

  if (cachedAttachment instanceof Buffer && attachment instanceof Buffer && cachedAttachment.equals(attachment)) {
    return false
  }

  container.attachments[name] = attachment
  return true
}
