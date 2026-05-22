import type { Express, Request, Response } from 'express'
import httpProxy from 'http-proxy-3'

export type ProxyOptions = {
  upstreamUrl: string
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
    proxy.web(req, res)
  })
}
