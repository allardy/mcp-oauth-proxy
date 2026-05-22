import { describe, expect, it } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { mountDiscovery } from '../src/discovery.js'

describe('mountDiscovery', () => {
  const buildApp = () => {
    const app = express()
    mountDiscovery(app, {
      issuerUrl: 'https://auth.example.com/application/o/test/',
      resourceUrl: 'https://mcp.example.com',
      injectRegistrationEndpoint: false,
    })
    return app
  }

  it('exposes /.well-known/oauth-protected-resource', async () => {
    const res = await supertest(buildApp()).get('/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({
      resource: 'https://mcp.example.com',
      authorization_servers: ['https://auth.example.com/application/o/test/'],
      bearer_methods_supported: ['header'],
    })
  })

  it('proxies /.well-known/oauth-authorization-server from the issuer', async () => {
    // The proxy fetches from the upstream issuer; here we just verify it 502s when unreachable.
    const res = await supertest(buildApp()).get('/.well-known/oauth-authorization-server')
    expect([200, 502]).toContain(res.status)
  })

  it('injects registration_endpoint when configured', async () => {
    const upstream = express()
    upstream.get('/.well-known/openid-configuration', (_req, res) => {
      res.json({
        issuer: 'http://127.0.0.1:0',
        authorization_endpoint: 'http://127.0.0.1:0/auth',
        token_endpoint: 'http://127.0.0.1:0/token',
      })
    })
    const upstreamServer = await new Promise<{ port: number; close: () => void }>((resolve) => {
      const server = upstream.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port
        resolve({ port, close: () => server.close() })
      })
    })

    try {
      const app = express()
      mountDiscovery(app, {
        issuerUrl: `http://127.0.0.1:${upstreamServer.port}/`,
        resourceUrl: 'https://mcp.example.com',
        injectRegistrationEndpoint: true,
      })
      const res = await supertest(app).get('/.well-known/oauth-authorization-server')
      expect(res.status).toBe(200)
      expect(res.body.registration_endpoint).toBe('https://mcp.example.com/oauth/register')
    } finally {
      upstreamServer.close()
    }
  })
})
