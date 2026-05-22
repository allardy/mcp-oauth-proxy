import { createServer, type Server } from 'node:http'

export type McpUpstreamFixture = {
  url: string
  port: number
  close: () => Promise<void>
  lastHeaders: () => Record<string, string | string[] | undefined>
}

export const startMcpUpstream = async (): Promise<McpUpstreamFixture> => {
  let lastHeaders: Record<string, string | string[] | undefined> = {}
  const server: Server = createServer((req, res) => {
    lastHeaders = req.headers
    if (req.url === '/mcp') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, path: req.url, method: req.method }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    lastHeaders: () => lastHeaders,
  }
}
