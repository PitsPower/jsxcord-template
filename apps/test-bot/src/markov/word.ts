export const START_OF_SENTENCE = Symbol('START_OF_SENTENCE')
export const END_OF_SENTENCE = Symbol('END_OF_SENTENCE')

export type Word = string | typeof START_OF_SENTENCE | typeof END_OF_SENTENCE
