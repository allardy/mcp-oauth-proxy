import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../src/index.js'
import { startOidcFixture, type OidcFixture } from './fixtures/oidc-server.js'
import { startMcpUpstream, type McpUpstreamFixture } from './fixtures/mcp-upstream.js'

describe('mcp-oauth-proxy integration', () => {
  let oidc: OidcFixture
  let upstream: McpUpstreamFixture
  let app: ReturnType<typeof buildApp>

  beforeAll(async () => {
    oidc = await startOidcFixture()
    upstream = await startMcpUpstream()
    app = buildApp({
      issuerUrl: oidc.issuerUrl,
      audience: 'test-aud',
      resourceUrl: 'https://mcp.example.com',
      allowSubs: ['yann'],
      allowEmails: [],
      allowGroups: [],
      upstreamUrl: upstream.url,
      rateLimitRpm: 600,
    })
  })

  afterAll(async () => {
    await oidc.close()
    await upstream.close()
  })

  it('serves discovery without auth', async () => {
    const res = await supertest(app).get('/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(res.body.resource).toBe('https://mcp.example.com')
  })

  it('serves /healthz without auth', async () => {
    const res = await supertest(app).get('/healthz')
    expect(res.status).toBe(200)
  })

  it('rejects unauthenticated MCP calls', async () => {
    const res = await supertest(app).get('/mcp')
    expect(res.status).toBe(401)
  })

  it('forwards authenticated requests to upstream', async () => {
    const token = await oidc.signToken({ sub: 'yann' }, { audience: 'test-aud' })
    const res = await supertest(app).get('/mcp').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, path: '/mcp', method: 'GET' })
  })

  it('rejects authenticated requests for non-allowed users', async () => {
    const token = await oidc.signToken({ sub: 'someone-else' }, { audience: 'test-aud' })
    const res = await supertest(app).get('/mcp').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})
