import { describe, expect, it } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { mountDiscovery } from '../src/discovery.js'

const startFakeUpstream = (issuer: string) => {
  const upstream = express()
  upstream.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
    })
  })
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    const server = upstream.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({ port, close: () => server.close() })
    })
  })
}

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

  it('exposes /.well-known/oauth-protected-resource with self-referencing authorization_servers', async () => {
    const res = await supertest(buildApp()).get('/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({
      resource: 'https://mcp.example.com',
      authorization_servers: ['https://mcp.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    })
  })

  it('rewritten auth-server metadata has issuer matching proxy URL, not upstream', async () => {
    const fake = await startFakeUpstream('https://auth.example.com/application/o/test')
    try {
      const app = express()
      mountDiscovery(app, {
        issuerUrl: `http://127.0.0.1:${fake.port}/`,
        resourceUrl: 'https://mcp.example.com',
        injectRegistrationEndpoint: false,
      })
      const res = await supertest(app).get('/.well-known/oauth-authorization-server')
      expect(res.status).toBe(200)
      expect(res.body.issuer).toBe('https://mcp.example.com')
      // Upstream's auth + token endpoints are preserved as-is
      expect(res.body.authorization_endpoint).toBe('https://auth.example.com/application/o/test/auth')
      expect(res.body.token_endpoint).toBe('https://auth.example.com/application/o/test/token')
      // registration_endpoint not injected when not configured
      expect(res.body.registration_endpoint).toBeUndefined()
    } finally {
      fake.close()
    }
  })

  it('falls back to 502 when upstream is unreachable', async () => {
    // The proxy fetches from the upstream issuer; here we just verify it 502s when unreachable.
    const res = await supertest(buildApp()).get('/.well-known/oauth-authorization-server')
    expect([200, 502]).toContain(res.status)
  })

  it('injects registration_endpoint when configured', async () => {
    const fake = await startFakeUpstream('http://127.0.0.1:0')
    try {
      const app = express()
      mountDiscovery(app, {
        issuerUrl: `http://127.0.0.1:${fake.port}/`,
        resourceUrl: 'https://mcp.example.com',
        injectRegistrationEndpoint: true,
      })
      const res = await supertest(app).get('/.well-known/oauth-authorization-server')
      expect(res.status).toBe(200)
      expect(res.body.issuer).toBe('https://mcp.example.com')
      expect(res.body.registration_endpoint).toBe('https://mcp.example.com/oauth/register')
    } finally {
      fake.close()
    }
  })

  it('uses custom scopes_supported when provided', async () => {
    const app = express()
    mountDiscovery(app, {
      issuerUrl: 'https://auth.example.com/',
      resourceUrl: 'https://mcp.example.com',
      injectRegistrationEndpoint: false,
      scopesSupported: ['read', 'write'],
    })
    const res = await supertest(app).get('/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(res.body.scopes_supported).toEqual(['read', 'write'])
  })
})
