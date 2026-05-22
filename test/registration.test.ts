import { describe, expect, it } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { mountRegistration } from '../src/registration.js'

describe('mountRegistration (static DCR shim)', () => {
  const buildApp = (clientId: string | undefined, clientSecret: string | undefined) => {
    const app = express()
    // Body parser is now mounted by mountRegistration itself on the /oauth/register route.
    mountRegistration(app, { staticClientId: clientId, staticClientSecret: clientSecret })
    return app
  }

  it('does not mount when creds are unset', async () => {
    const res = await supertest(buildApp(undefined, undefined))
      .post('/oauth/register')
      .send({ redirect_uris: ['https://example.com/cb'] })
    expect(res.status).toBe(404)
  })

  it('returns 201 with the configured client_id and client_secret', async () => {
    const res = await supertest(buildApp('my-client', 'my-secret'))
      .post('/oauth/register')
      .send({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' })
    expect(res.status).toBe(201)
    expect(res.body.client_id).toBe('my-client')
    expect(res.body.client_secret).toBe('my-secret')
    expect(res.body.client_id_issued_at).toBeTypeOf('number')
    expect(res.body.client_secret_expires_at).toBe(0)
    expect(res.body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback'])
    expect(res.body.client_name).toBe('Claude')
  })

  it('returns sane defaults for grant_types and response_types when not provided', async () => {
    const res = await supertest(buildApp('id', 'secret')).post('/oauth/register').send({ redirect_uris: [] })
    expect(res.body.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(res.body.response_types).toEqual(['code'])
    expect(res.body.token_endpoint_auth_method).toBe('client_secret_basic')
  })

  it('echoes back custom grant_types and response_types', async () => {
    const res = await supertest(buildApp('id', 'secret'))
      .post('/oauth/register')
      .send({
        redirect_uris: [],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
      })
    expect(res.body.grant_types).toEqual(['authorization_code'])
    expect(res.body.response_types).toEqual(['code'])
    expect(res.body.token_endpoint_auth_method).toBe('client_secret_post')
  })
})
