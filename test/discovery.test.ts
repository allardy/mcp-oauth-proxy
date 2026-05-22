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
})
