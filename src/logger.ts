import { pino } from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino(
  isDev
    ? { level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } }
    : { level: process.env.LOG_LEVEL ?? 'info' },
)
