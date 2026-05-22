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

  // The proxy hosts this discovery endpoint at its own URL (resource_metadata.authorization_servers points
  // here), but the metadata body's `issuer` is preserved AS-IS from the upstream IdP. This is deliberate:
  // tokens are signed by the upstream and carry the upstream's `iss` claim — MCP clients (e.g. Claude.ai)
  // verify the token's iss against the metadata's `issuer`, so they MUST match.
  //
  // The trade-off: we technically violate RFC 8414 §3.3's "issuer MUST match metadata URL" rule. Strict
  // clients would reject. Empirically, Claude.ai tolerates this; if a stricter client appears we'll need
  // to proxy the token endpoint and re-sign with our own key.
  app.get('/.well-known/oauth-authorization-server', async (_req, res) => {
    const upstream = new URL('.well-known/openid-configuration', ensureTrailingSlash(opts.issuerUrl))
    try {
      const upstreamRes = await fetch(upstream)
      if (!upstreamRes.ok) {
        res.status(502).json({ error: `upstream issuer returned ${upstreamRes.status}` })
        return
      }
      const upstreamJson = (await upstreamRes.json()) as Record<string, unknown>

      // Preserve upstream issuer/endpoints; only add scopes + (optionally) the static-DCR registration_endpoint.
      const rewritten: Record<string, unknown> = {
        ...upstreamJson,
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
