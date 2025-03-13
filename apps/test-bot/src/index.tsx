import { bot } from '@repo/jsxcord'
import { logger } from '@repo/logger'

bot({ test: 'Hello!' })
  .on('ready', () => logger.info('Bot started'))
  .login(process.env.DISCORD_TOKEN!)
