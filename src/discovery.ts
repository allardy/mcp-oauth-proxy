import type { Express } from 'express'
import { logger } from './logger.js'

export type DiscoveryOptions = {
  // Upstream OIDC issuer URL. The proxy fetches the upstream auth-server metadata from here,
  // then rewrites it to advertise itself as the issuer.
  issuerUrl: string
  // The proxy's public URL. Used as the issuer/authorization-server identifier in the rewritten metadata.
  resourceUrl: string
  // When true, the rewritten auth-server metadata advertises a registration_endpoint on the proxy itself.
  injectRegistrationEndpoint: boolean
  // Comma-separated scopes the resource server supports. Added to protected-resource metadata. Defaults to a sane MCP-y set if undefined.
  scopesSupported?: string[]
}

export const mountDiscovery = (app: Express, opts: DiscoveryOptions) => {
  const resource = opts.resourceUrl.replace(/\/$/, '')
  const scopes = opts.scopesSupported ?? ['openid', 'profile', 'email', 'offline_access']

  // RFC 9728 — point authorization_servers at the proxy itself so MCP clients fetch our auth-server metadata.
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource,
      authorization_servers: [resource],
      bearer_methods_supported: ['header'],
      scopes_supported: scopes,
    })
  })

  // RFC 8414 — the proxy presents itself as the authorization server. Authorize and token endpoints
  // remain on the upstream IdP (the client follows those URLs directly), but issuer and registration_endpoint
  // match the proxy's URL.
  app.get('/.well-known/oauth-authorization-server', async (_req, res) => {
    const upstream = new URL('.well-known/openid-configuration', ensureTrailingSlash(opts.issuerUrl))
    try {
      const upstreamRes = await fetch(upstream)
      if (!upstreamRes.ok) {
        res.status(502).json({ error: `upstream issuer returned ${upstreamRes.status}` })
        return
      }
      const upstreamJson = (await upstreamRes.json()) as Record<string, unknown>

      // Rewrite issuer + (optionally) registration_endpoint. Keep upstream's authorize/token/jwks/userinfo as-is —
      // the client follows those directly to the upstream IdP.
      const rewritten: Record<string, unknown> = {
        ...upstreamJson,
        issuer: resource,
        scopes_supported: scopes,
      }
      if (opts.injectRegistrationEndpoint) {
        rewritten['registration_endpoint'] = `${resource}/oauth/register`
      }
      res.setHeader('content-type', 'application/json')
      res.status(200).json(rewritten)
    } catch (err) {
      logger.error({ err }, 'failed to fetch upstream issuer metadata')
      res.status(502).json({ error: 'upstream issuer unreachable' })
    }
  })

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' })
  })
}

const ensureTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)
