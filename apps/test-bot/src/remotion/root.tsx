import { RootBuilder } from '@repo/jsxcord-remotion/root'
import { z } from 'zod'
import { calculateSlideshowMetadata, GuySlideshow } from './guy.js'
import { calculateLifeMetadata, GameOfLife } from './life.js'

export const root = new RootBuilder()
  .add({
    id: 'GuySlideshow',
    component: GuySlideshow,
    defaultProps: { images: [] },
    schema: z.object({ images: z.string().array() }),
    calculateMetadata: calculateSlideshowMetadata,
  })
  .add({
    id: 'GameOfLife',
    component: GameOfLife,
    defaultProps: { grid: [] },
    schema: z.object({ grid: z.boolean().array().array() }),
    calculateMetadata: calculateLifeMetadata,
  })
  .register()
