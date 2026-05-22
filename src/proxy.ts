import type { Express, Request, Response } from 'express'
import httpProxy from 'http-proxy-3'

export type ProxyOptions = {
  upstreamUrl: string
  // If set, all requests are rewritten to this exact path on the upstream (e.g. `/mcp`).
  // If undefined, paths pass through unchanged.
  upstreamPath: string | undefined
}

export const mountProxy = (app: Express, opts: ProxyOptions) => {
  const proxy = httpProxy.createProxyServer({
    target: opts.upstreamUrl,
    changeOrigin: true,
    proxyTimeout: 60_000,
    timeout: 60_000,
    ws: false,
  })

  proxy.on('error', (err, _req, res) => {
    if (res && 'writeHead' in res && !res.headersSent) {
      ;(res as Response).status(502).json({ error: 'upstream proxy error', message: err.message })
    }
  })

  // Catch-all — must be registered LAST in the Express stack.
  app.use((req: Request, res: Response) => {
    if (opts.upstreamPath) {
      // Rewrite the request URL so http-proxy forwards to the configured path on the upstream
      req.url = opts.upstreamPath
    }
    proxy.web(req, res)
  })
}
