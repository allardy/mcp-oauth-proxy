import type { Express } from 'express'
import { logger } from './logger.js'

export type DiscoveryOptions = {
  issuerUrl: string
  resourceUrl: string
}

export const mountDiscovery = (app: Express, opts: DiscoveryOptions) => {
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: opts.resourceUrl.replace(/\/$/, ''),
      authorization_servers: [opts.issuerUrl],
      bearer_methods_supported: ['header'],
    })
  })

  app.get('/.well-known/oauth-authorization-server', async (_req, res) => {
    const upstream = new URL('.well-known/openid-configuration', ensureTrailingSlash(opts.issuerUrl))
    try {
      const upstreamRes = await fetch(upstream)
      if (!upstreamRes.ok) {
        res.status(502).json({ error: `upstream issuer returned ${upstreamRes.status}` })
        return
      }
      res.setHeader('content-type', 'application/json')
      const body = await upstreamRes.text()
      res.status(200).send(body)
    } catch (err) {
      logger.error({ err }, 'failed to proxy authorization-server metadata')
      res.status(502).json({ error: 'upstream issuer unreachable' })
    }
  })

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' })
  })
}

const ensureTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)
