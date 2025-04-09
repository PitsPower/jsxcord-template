import { createComponents } from '@repo/jsxcord-remotion/components'
import { root } from './root.js'

const { GameOfLife, GuySlideshow } = createComponents({
  rootPath: './src/remotion/root.tsx',
  rootBuilder: root,
})

export { GameOfLife, GuySlideshow }
