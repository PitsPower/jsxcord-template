import type { Word } from './word.js'

type Format =
  | 'capitalized'
  | 'lowercase'
  | 'uppercase'

  | 'key' // Special format for Markov chain

/**
 * Determines which format a piece of text is in.
 *
 * @param text - The string to check format of
 * @returns The detected format or null if no specific format is detected
 */
export function getFormat(text: string): Format | null {
  if (text === 'I') {
    return 'capitalized'
  }

  if (text === text.toUpperCase() && text !== text.toLowerCase()) {
    return 'uppercase'
  }

  if (text === text.toLowerCase() && text !== text.toUpperCase()) {
    return 'lowercase'
  }

  if (
    text.charAt(0) === text.charAt(0).toUpperCase()
    && text.slice(1) === text.slice(1).toLowerCase()
    && text !== text.toUpperCase()
    && text !== text.toLowerCase()
  ) {
    return 'capitalized'
  }

  return null
}

/**
 * Converts a string to the specified format.
 *
 * @param text - The string to format
 * @param format - The formatting to apply
 * @returns The formatted string
 */
export function formatText(text: string, format: Format): string {
  switch (format) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalized':
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()

    case 'key':
      return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    default:
      return text
  }
}

/**
 * Determines which format a word is in.
 *
 * @param word - The word to check format of
 * @returns The detected format or null if no specific format is detected
 */
export function getWordFormat(word: Word): Format | null {
  if (typeof word === 'string') {
    return getFormat(word)
  }
  return null
}

/**
 * Converts a word to the specified format.
 *
 * @param word - The word to format
 * @param format - The formatting to apply
 * @param wordBefore - Optional word to prepend before formatting
 * @returns The formatted word
 */
export function formatWord(word: Word, format: Format, wordBefore?: Word): Word {
  if (typeof word === 'string') {
    if (typeof wordBefore === 'string') {
      const combined = `${wordBefore} ${word}`
      const formatted = formatText(combined, format)
      return formatted.split(' ')[1]
    }
    else {
      return formatText(word, format)
    }
  }
  return word
}
