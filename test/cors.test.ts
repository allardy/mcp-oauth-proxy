import { describe, expect, it } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { createCorsMiddleware } from '../src/cors.js'

describe('createCorsMiddleware', () => {
  const buildApp = (allowOrigins: string[]) => {
    const app = express()
    app.use(createCorsMiddleware({ allowOrigins }))
    app.get('/ping', (_req, res) => res.json({ ok: true }))
    app.post('/ping', (_req, res) => res.json({ ok: true }))
    return app
  }

  it('handles OPTIONS preflight from allowed origin with 204 + CORS headers', async () => {
    const res = await supertest(buildApp(['https://claude.ai']))
      .options('/ping')
      .set('Origin', 'https://claude.ai')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('https://claude.ai')
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/)
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i)
    expect(res.headers['access-control-expose-headers']).toMatch(/WWW-Authenticate/i)
  })

  it('rejects OPTIONS preflight from disallowed origin with 403', async () => {
    const res = await supertest(buildApp(['https://claude.ai']))
      .options('/ping')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST')
    expect(res.status).toBe(403)
  })

  it('adds CORS headers to non-preflight responses from allowed origin', async () => {
    const res = await supertest(buildApp(['https://claude.ai']))
      .get('/ping')
      .set('Origin', 'https://claude.ai')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('https://claude.ai')
    expect(res.headers['vary']).toMatch(/Origin/i)
  })

  it('omits CORS headers for non-allowed origins on non-OPTIONS but still serves', async () => {
    const res = await supertest(buildApp(['https://claude.ai']))
      .get('/ping')
      .set('Origin', 'https://other.example.com')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('passes through requests with no Origin header', async () => {
    const res = await supertest(buildApp(['https://claude.ai'])).get('/ping')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('handles OPTIONS with no Origin header (curl-style probe) with 204', async () => {
    const res = await supertest(buildApp(['https://claude.ai'])).options('/ping')
    expect(res.status).toBe(204)
  })

  it('wildcard origin allows anything', async () => {
    const res = await supertest(buildApp(['*']))
      .options('/ping')
      .set('Origin', 'https://random.example.com')
      .set('Access-Control-Request-Method', 'POST')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('https://random.example.com')
  })
})
