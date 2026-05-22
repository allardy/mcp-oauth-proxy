import type { NextFunction, Request, Response } from 'express'

export type CorsOptions = {
  // Allowed origins. Empty array = allow nothing (effectively disables CORS).
  // Single entry `'*'` = allow any origin (note: in that mode, Allow-Credentials is forced off).
  allowOrigins: string[]
}

// Headers the MCP client needs to send: Authorization (bearer), Content-Type (JSON body),
// Accept (so it can request text/event-stream for SSE), Mcp-Session-Id (MCP stateful sessions).
const ALLOW_HEADERS = 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version'
// Methods MCP Streamable HTTP transport uses.
const ALLOW_METHODS = 'GET, POST, DELETE, OPTIONS'
// Headers the browser needs to read out of responses (WWW-Authenticate carries OAuth discovery hint).
const EXPOSE_HEADERS = 'WWW-Authenticate, Mcp-Session-Id'
const MAX_AGE = '600' // cache preflight 10min

export const createCorsMiddleware = (opts: CorsOptions) => {
  const wildcard = opts.allowOrigins.includes('*')
  const allowList = new Set(opts.allowOrigins)

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin')

    // No Origin = same-origin or non-browser client; skip CORS entirely.
    if (!origin) {
      if (req.method === 'OPTIONS') {
        res.status(204).end()
        return
      }
      return next()
    }

    const isAllowed = wildcard || allowList.has(origin)
    if (isAllowed) {
      // Echo back the requesting origin (not `*`) so credentials-style requests work
      // and so the response is unambiguous. Vary: Origin lets caches handle multiple origins.
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS)
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS)
      res.setHeader('Access-Control-Expose-Headers', EXPOSE_HEADERS)
      res.setHeader('Access-Control-Max-Age', MAX_AGE)
    }

    if (req.method === 'OPTIONS') {
      // Preflight short-circuit — don't fall through to auth middleware.
      res.status(isAllowed ? 204 : 403).end()
      return
    }

    next()
  }
}
