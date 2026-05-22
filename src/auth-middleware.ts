import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { createJwtVerifier } from './jwt.js'
import { logger } from './logger.js'

export type AuthMiddlewareOptions = {
  issuerUrl: string
  audience: string
  resourceUrl: string
  allowSubs: string[]
  allowEmails: string[]
  allowGroups: string[]
}

type AuthedRequest = Request & {
  auth?: {
    sub: string
    email: string | undefined
    groups: string[]
  }
}

const wwwAuthenticateFor = (reason: 'missing' | 'invalid', resourceUrl: string) => {
  const r = resourceUrl.replace(/\/$/, '')
  const realm = `"${r}"`
  const errorCode = reason === 'missing' ? '"invalid_request"' : '"invalid_token"'
  const description = reason === 'missing' ? '"Bearer token required"' : '"The access token is invalid or expired"'
  const metadata = `"${r}/.well-known/oauth-protected-resource"`
  return `Bearer realm=${realm}, error=${errorCode}, error_description=${description}, resource_metadata=${metadata}`
}

export const createAuthMiddleware = (opts: AuthMiddlewareOptions): RequestHandler => {
  const verify = createJwtVerifier({ issuerUrl: opts.issuerUrl, audience: opts.audience })

  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.header('authorization')
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      res.setHeader('www-authenticate', wwwAuthenticateFor('missing', opts.resourceUrl))
      res.status(401).json({ error: 'missing or malformed Authorization header' })
      return
    }
    const token = header.slice('bearer '.length).trim()
    let claims
    try {
      claims = await verify(token)
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'token verification failed')
      res.setHeader('www-authenticate', wwwAuthenticateFor('invalid', opts.resourceUrl))
      res.status(401).json({ error: 'invalid token' })
      return
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : ''
    const email = typeof claims['email'] === 'string' ? (claims['email'] as string) : undefined
    const groups = Array.isArray(claims['groups']) ? (claims['groups'] as string[]) : []

    const subOk = opts.allowSubs.length > 0 && opts.allowSubs.includes(sub)
    const emailOk = !!email && opts.allowEmails.length > 0 && opts.allowEmails.includes(email)
    const groupOk = opts.allowGroups.length > 0 && groups.some((g) => opts.allowGroups.includes(g))

    if (!subOk && !emailOk && !groupOk) {
      logger.warn({ sub, email, groups }, 'token verified but not in allow-list')
      res.status(403).json({ error: 'not authorized' })
      return
    }

    req.auth = { sub, email, groups }
    next()
  }
}
