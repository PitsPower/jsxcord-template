import fs from 'node:fs/promises'
import { createContext, useContext } from 'react'
import { Markdown } from './component.js'

export const ManagedEmojiSymbol = Symbol('ManagedEmoji')

export interface ManagedEmoji {
  __type: typeof ManagedEmojiSymbol
  emojiName: string
  emojiSrc: string | Buffer
}

export const EmojiContext = createContext<Record<string, string>>({})

export function createEmoji(name: string, src: string | Buffer): ManagedEmoji & React.FC<object> {
  const Emoji = () => {
    const { [name]: emoji } = useContext(EmojiContext)

    if (emoji === undefined) {
      throw new Error(`Emoji "${name}" not registered`)
    }

    return <Markdown>{emoji}</Markdown>
  }
  Emoji.__type = ManagedEmojiSymbol
  Emoji.emojiName = name
  Emoji.emojiSrc = src

  return Emoji
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
