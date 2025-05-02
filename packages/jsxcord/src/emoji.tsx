import type { ApplicationEmoji } from 'discord.js'
import fs from 'node:fs/promises'
import { createContext, useContext } from 'react'
import { Emoji } from './component.js'

export const ManagedEmojiSymbol = Symbol('ManagedEmoji')

export interface ManagedEmoji {
  __type: typeof ManagedEmojiSymbol
  emojiName: string
  emojiSrc: string | Buffer
}

export const EmojiContext = createContext<Record<string, ApplicationEmoji>>({})

export function createEmoji(name: string, src: string | Buffer): ManagedEmoji & React.FC<object> {
  const CustomEmoji = () => {
    const { [name]: emoji } = useContext(EmojiContext)

    if (emoji === undefined || emoji.name === null) {
      throw new Error(`Emoji "${name}" not registered`)
    }

    return <Emoji name={emoji.name} />
  }
  CustomEmoji.__type = ManagedEmojiSymbol
  CustomEmoji.emojiName = name
  CustomEmoji.emojiSrc = src

  return CustomEmoji
}

export async function createEmojisFromFolder(folderPath: string): Promise<Record<string, ManagedEmoji & React.FC<object>>> {
  const files = await fs.readdir(folderPath)
  const emojis: Record<string, ManagedEmoji & React.FC<object>> = {}

  for (const file of files) {
    if (file.match(/\.(png|jpg|jpeg|gif)$/i)) {
      const emojiName = file.split('.')[0]
      const emojiPath = `${folderPath}/${file}`
      const emoji = createEmoji(emojiName, emojiPath)
      emojis[emojiName] = emoji
    }
  }

  return emojis
}
