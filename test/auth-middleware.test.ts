import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { createAuthMiddleware } from '../src/auth-middleware.js'
import { startOidcFixture, type OidcFixture } from './fixtures/oidc-server.js'

describe('createAuthMiddleware', () => {
  let oidc: OidcFixture

  beforeAll(async () => {
    oidc = await startOidcFixture()
  })

  afterAll(async () => {
    await oidc.close()
  })

  const buildApp = (overrides: Partial<Parameters<typeof createAuthMiddleware>[0]> = {}) => {
    const app = express()
    app.use(
      createAuthMiddleware({
        issuerUrl: oidc.issuerUrl,
        audience: 'test-aud',
        allowSubs: ['allowed-user'],
        allowEmails: [],
        allowGroups: [],
        resourceUrl: 'https://mcp.example.com',
        ...overrides,
      }),
    )
    app.get('/protected', (req, res) => {
      res.json({ sub: (req as express.Request & { auth?: { sub: string } }).auth?.sub })
    })
    return app
  }

  it('rejects requests without an Authorization header with 401 + WWW-Authenticate', async () => {
    const res = await supertest(buildApp()).get('/protected')
    expect(res.status).toBe(401)
    expect(res.headers['www-authenticate']).toMatch(/Bearer/)
    expect(res.headers['www-authenticate']).toMatch(
      /resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource"/,
    )
    expect(res.headers['www-authenticate']).toMatch(/error="invalid_request"/)
    expect(res.headers['www-authenticate']).toMatch(/error_description=/)
  })

  it('rejects malformed Authorization header', async () => {
    const res = await supertest(buildApp()).get('/protected').set('authorization', 'NotBearer xyz')
    expect(res.status).toBe(401)
  })

  it('rejects an invalid token with 401', async () => {
    const res = await supertest(buildApp()).get('/protected').set('authorization', 'Bearer not.a.jwt')
    expect(res.status).toBe(401)
  })

  it('WWW-Authenticate on invalid token contains error="invalid_token" and all RFC 6750 params', async () => {
    const res = await supertest(buildApp()).get('/protected').set('authorization', 'Bearer not.a.jwt')
    expect(res.status).toBe(401)
    const header = res.headers['www-authenticate'] as string
    expect(header).toMatch(/realm=/)
    expect(header).toMatch(/error="invalid_token"/)
    expect(header).toMatch(/error_description=/)
    expect(header).toMatch(/resource_metadata=/)
  })

  it('rejects a valid token whose sub is not in allow-list with 403', async () => {
    const token = await oidc.signToken({ sub: 'not-allowed' }, { audience: 'test-aud' })
    const res = await supertest(buildApp()).get('/protected').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('passes through a valid token with allowed sub', async () => {
    const token = await oidc.signToken({ sub: 'allowed-user' }, { audience: 'test-aud' })
    const res = await supertest(buildApp()).get('/protected').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.sub).toBe('allowed-user')
  })

  it('passes through a valid token with allowed email', async () => {
    const token = await oidc.signToken({ sub: 'x', email: 'yann@example.com' }, { audience: 'test-aud' })
    const res = await supertest(buildApp({ allowSubs: [], allowEmails: ['yann@example.com'] }))
      .get('/protected')
      .set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('passes through when any one allow-list matches (sub OR email OR group)', async () => {
    const token = await oidc.signToken(
      { sub: 'unknown', email: 'unknown@example.com', groups: ['admin'] },
      { audience: 'test-aud' },
    )
    const res = await supertest(buildApp({ allowSubs: [], allowEmails: [], allowGroups: ['admin'] }))
      .get('/protected')
      .set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
