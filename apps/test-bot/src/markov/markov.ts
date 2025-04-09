import type { Word } from './word.js'
import { formatWord, getWordFormat } from './format.js'
import { END_OF_SENTENCE, START_OF_SENTENCE } from './word.js'

type WordIndex = number
type WordCount = number

/** A Markov chain model for generating text based on word associations. */
export class MarkovChain {
  private words: Word[] = []
  private wordKeys: Word[] = []
  // For each word in `words`, store a map of word indices to their counts
  private associations: Record<WordIndex, WordCount>[] = []

  /**
   * Serializes a word to a string representation.
   * Handles special symbols like START_OF_SENTENCE and END_OF_SENTENCE.
   *
   * @param word - The word to serialize
   * @returns A string representation of the word
   */
  private serializeWord(word: Word): string {
    if (word === START_OF_SENTENCE)
      return '__START__'
    if (word === END_OF_SENTENCE)
      return '__END__'
    return String(word)
  }

  /**
   * Deserializes a string back to a Word.
   * Converts special marker strings back to their symbol representation.
   *
   * @param serialized - The serialized word string
   * @returns The deserialized Word
   */
  private deserializeWord(serialized: string): Word {
    if (serialized === '__START__')
      return START_OF_SENTENCE
    if (serialized === '__END__')
      return END_OF_SENTENCE
    return serialized
  }

  /**
   * Converts the Markov chain state to a serializable string.
   *
   * @returns A JSON string representation of the Markov chain
   */
  toString(): string {
    return JSON.stringify({
      words: this.words.map(word => this.serializeWord(word)),
      wordKeys: this.wordKeys.map(word => this.serializeWord(word)),
      associations: this.associations,
    })
  }

  /**
   * Loads the Markov chain state from a serialized string.
   *
   * @param serialized - The serialized Markov chain state
   * @returns The current MarkovChain instance for chaining
   */
  fromString(serialized: string): MarkovChain {
    try {
      const data = JSON.parse(serialized)
      this.words = data.words.map((word: string) => this.deserializeWord(word))
      this.wordKeys = data.wordKeys.map((word: string) => this.deserializeWord(word))
      this.associations = data.associations
      return this
    }
    catch (error: any) {
      throw new Error(`Failed to load Markov chain: ${error.message}`)
    }
  }

  /**
   * Creates a new MarkovChain instance from a serialized string.
   *
   * @param serialized - The serialized Markov chain state
   * @returns A new MarkovChain instance
   */
  static fromString(serialized: string): MarkovChain {
    const chain = new MarkovChain()
    return chain.fromString(serialized)
  }

  /**
   * Gets the next word based on Markov chain probability.
   *
   * @param word - The current word to find a successor for
   * @returns The next word in the chain, selected based on probability distribution
   */
  private getNextWord(word: Word) {
    const originalFormat = getWordFormat(word)
    const wordKey = formatWord(word, 'key')
    const wordIndex = this.wordKeys.indexOf(wordKey)
    const associations = this.associations[wordIndex]
    const indices = Object.keys(associations)
    // TODO: Experiment with using counts
    const nextWordIndex = Number.parseInt(indices[Math.floor(Math.random() * indices.length)])

    const result = this.words[nextWordIndex]
    return originalFormat && Math.random() < 0.5
      ? formatWord(result, originalFormat, word)
      : result
  }

  /**
   * Generates a random sentence using the Markov chain.
   *
   * @returns The sentence
   */
  generateSentence() {
    if (this.words.length === 0) {
      throw new Error('No words in the Markov chain')
    }

    let word: Word = START_OF_SENTENCE
    const sentence: Word[] = []

    while (word !== END_OF_SENTENCE) {
      word = this.getNextWord(word)
      if (typeof word === 'string') {
        sentence.push(word)
      }
    }

    return sentence.join(' ')
  }

  /**
   * Adds a sentence to the Markov chain model.
   *
   * @param sentence - The input sentence to add to the Markov chain
   */
  addSentence(sentence: string) {
    const words: Word[] = [
      START_OF_SENTENCE,
      ...sentence.split(/\s+/g),
      END_OF_SENTENCE,
    ]

    for (const word of words) {
      if (!this.words.includes(word)) {
        this.words.push(word)
        this.wordKeys.push(formatWord(word, 'key'))
        this.associations.push({})
      }
    }

    for (let i = 0; i < words.length - 1; i++) {
      const word = formatWord(words[i], 'key')
      const nextWord = words[i + 1]

      const wordIndex = this.wordKeys.indexOf(word)
      const nextWordIndex = this.words.indexOf(nextWord)

      const association = this.associations[wordIndex]
      association[nextWordIndex] = (association[nextWordIndex] ?? 0) + 1
    }
  }
}
