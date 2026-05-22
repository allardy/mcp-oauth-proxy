import express, { type Express } from 'express'
import { loadConfig } from './config.js'
import { createAuthMiddleware } from './auth-middleware.js'
import { createCorsMiddleware } from './cors.js'
import { mountDiscovery } from './discovery.js'
import { mountProxy } from './proxy.js'
import { mountRegistration } from './registration.js'
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
  allowOrigins: string[]
  staticClientId: string | undefined
  staticClientSecret: string | undefined
  upstreamPath: string | undefined
  scopesSupported?: string[]
}): Express => {
  const app = express()
  app.disable('x-powered-by')

  // CORS must run before auth so OPTIONS preflights short-circuit cleanly.
  app.use(createCorsMiddleware({ allowOrigins: opts.allowOrigins }))

  // Request log — runs before auth so we can see all incoming requests including 401-bound ones.
  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - start,
          origin: req.header('origin'),
          ua: req.header('user-agent'),
          contentType: req.header('content-type'),
          accept: req.header('accept'),
          hasAuth: !!req.header('authorization'),
        },
        'request',
      )
    })
    next()
  })

  mountDiscovery(app, {
    issuerUrl: opts.issuerUrl,
    resourceUrl: opts.resourceUrl,
    injectRegistrationEndpoint: Boolean(opts.staticClientId && opts.staticClientSecret),
    ...(opts.scopesSupported !== undefined && { scopesSupported: opts.scopesSupported }),
  })

  // Body parser for /oauth/register JSON payload — must come before mountRegistration.
  app.use(express.json())

  // /oauth/register is public — needs to be reachable before any auth middleware.
  mountRegistration(app, {
    staticClientId: opts.staticClientId,
    staticClientSecret: opts.staticClientSecret,
  })

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
    if (req.path.startsWith('/.well-known/') || req.path === '/healthz' || req.path === '/oauth/register') return next()
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

  mountProxy(app, { upstreamUrl: opts.upstreamUrl, upstreamPath: opts.upstreamPath })

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
    allowOrigins: config.allowOrigins,
    staticClientId: config.staticClientId,
    staticClientSecret: config.staticClientSecret,
    upstreamPath: config.mcpUpstreamPath,
    ...(config.scopesSupported !== undefined && { scopesSupported: config.scopesSupported }),
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
