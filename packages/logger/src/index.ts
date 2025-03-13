import winston, { format } from 'winston'

const alignedWithColorsAndTime = format.combine(
  format.colorize(),
  format.timestamp({ format: 'shortTime' }),
  format.align(),
  format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`),
)

export const logger = winston.createLogger({
  format: alignedWithColorsAndTime,
  transports: [
    new winston.transports.Console(),
  ],
})
