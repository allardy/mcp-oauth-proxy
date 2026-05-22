import type { Express } from 'express'
import { logger } from './logger.js'

export type DiscoveryOptions = {
  issuerUrl: string
  resourceUrl: string
  // When true, the proxied auth-server discovery doc is augmented with a registration_endpoint
  // pointing at this proxy's /oauth/register. Used to fake DCR for clients that demand it.
  injectRegistrationEndpoint: boolean
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
      const body = await upstreamRes.text()
      if (opts.injectRegistrationEndpoint) {
        try {
          const json = JSON.parse(body) as Record<string, unknown>
          json['registration_endpoint'] = `${opts.resourceUrl.replace(/\/$/, '')}/oauth/register`
          res.setHeader('content-type', 'application/json')
          res.status(200).send(JSON.stringify(json))
          return
        } catch (err) {
          // Fall through to passthrough if upstream body isn't valid JSON
          logger.warn({ err }, 'upstream auth-server metadata not JSON; passing through unchanged')
        }
      }
      res.setHeader('content-type', 'application/json')
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
