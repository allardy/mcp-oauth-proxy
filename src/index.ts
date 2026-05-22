import express, { type Express } from 'express'
import { loadConfig } from './config.js'
import { createAuthMiddleware } from './auth-middleware.js'
import { mountDiscovery } from './discovery.js'
import { mountProxy } from './proxy.js'
import { createRateLimiter } from './rate-limit.js'
import { spawnMcpUpstream, type SpawnedUpstream } from './spawn.js'
import { logger } from './logger.js'

const buildApp = (opts: {
  issuerUrl: string
  audience: string
  resourceUrl: string
  allowSubs: string[]
  allowEmails: string[]
  allowGroups: string[]
  upstreamUrl: string
  rateLimitRpm: number
}): Express => {
  const app = express()
  app.disable('x-powered-by')

  mountDiscovery(app, { issuerUrl: opts.issuerUrl, resourceUrl: opts.resourceUrl })

  const limiter = createRateLimiter({ rpm: opts.rateLimitRpm })
  const auth = createAuthMiddleware({
    issuerUrl: opts.issuerUrl,
    audience: opts.audience,
    resourceUrl: opts.resourceUrl,
    allowSubs: opts.allowSubs,
    allowEmails: opts.allowEmails,
    allowGroups: opts.allowGroups,
  })

  app.use((req, res, next) => {
    if (req.path.startsWith('/.well-known/') || req.path === '/healthz') return next()
    auth(req, res, (err) => {
      if (err) return next(err)
      const sub = (req as express.Request & { auth?: { sub: string } }).auth?.sub
      if (sub && !limiter.tryConsume(sub)) {
        res.status(429).json({ error: 'rate limit exceeded' })
        return
      }
      next()
    })
  })

  mountProxy(app, { upstreamUrl: opts.upstreamUrl })

  return app
}

export { buildApp }

const main = async () => {
  const config = loadConfig()
  logger.info({ port: config.port, resourceUrl: config.resourceUrl }, 'starting mcp-oauth-proxy')

  let spawned: SpawnedUpstream | undefined
  let upstreamUrl: string
  if (config.mcpSpawnCmd && config.mcpSpawnPort) {
    spawned = await spawnMcpUpstream({ cmd: config.mcpSpawnCmd, port: config.mcpSpawnPort })
    upstreamUrl = spawned.url
    logger.info({ upstreamUrl }, 'spawned MCP upstream')
  } else if (config.mcpUpstreamUrl) {
    upstreamUrl = config.mcpUpstreamUrl
  } else {
    throw new Error('no MCP upstream configured')
  }

  const app = buildApp({
    issuerUrl: config.oidcIssuerUrl,
    audience: config.oidcAudience,
    resourceUrl: config.resourceUrl,
    allowSubs: config.allowSubs,
    allowEmails: config.allowEmails,
    allowGroups: config.allowGroups,
    upstreamUrl,
    rateLimitRpm: config.rateLimitRpm,
  })

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'mcp-oauth-proxy listening')
  })

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    server.close()
    if (spawned) await spawned.shutdown()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error({ err }, 'fatal startup error')
    process.exit(1)
  })
}
