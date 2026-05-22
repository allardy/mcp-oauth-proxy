import express, { type Express, type Request, type Response } from 'express'
import { logger } from './logger.js'

export type RegistrationOptions = {
  // If empty, this endpoint isn't mounted. When both are set, /oauth/register returns these creds verbatim.
  staticClientId: string | undefined
  staticClientSecret: string | undefined
}

type RegistrationRequest = {
  redirect_uris?: unknown
  client_name?: unknown
  grant_types?: unknown
  response_types?: unknown
  token_endpoint_auth_method?: unknown
  scope?: unknown
}

export const mountRegistration = (app: Express, opts: RegistrationOptions) => {
  if (!opts.staticClientId || !opts.staticClientSecret) return

  const clientId = opts.staticClientId
  const clientSecret = opts.staticClientSecret

  // Body parser is mounted on this route ONLY — a global express.json() would consume the body
  // for proxied MCP calls and leave nothing for http-proxy-3 to forward (the request stream is
  // already drained when the proxy tries to read it).
  app.post('/oauth/register', express.json(), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as RegistrationRequest
    // Echo back the requested redirect_uris if any; otherwise return an empty array.
    // We don't enforce them — the upstream OIDC provider's redirect_uri whitelist is what actually matters at /authorize time.
    const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : []
    const grantTypes = Array.isArray(body.grant_types)
      ? (body.grant_types as string[])
      : ['authorization_code', 'refresh_token']
    const responseTypes = Array.isArray(body.response_types) ? (body.response_types as string[]) : ['code']
    const tokenEndpointAuthMethod =
      typeof body.token_endpoint_auth_method === 'string'
        ? (body.token_endpoint_auth_method as string)
        : 'client_secret_basic'
    const clientName = typeof body.client_name === 'string' ? (body.client_name as string) : undefined

    logger.info({ clientName, redirectUris }, 'static DCR registration request')

    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // 0 means never expires per RFC 7591
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      // Optional but informative
      ...(clientName ? { client_name: clientName } : {}),
    })
  })
}
