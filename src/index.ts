import { logger } from './logger.js'

const main = async () => {
  logger.info('mcp-oauth-proxy starting')
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error')
  process.exit(1)
})
