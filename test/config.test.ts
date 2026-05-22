import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  const baseEnv = {
    OIDC_ISSUER_URL: 'https://auth.example.com/application/o/test/',
    OIDC_AUDIENCE: 'test-mcp',
    RESOURCE_URL: 'https://mcp.example.com',
    ALLOW_SUBS: 'user-uuid-1',
    MCP_UPSTREAM_URL: 'http://127.0.0.1:8765',
  }

  it('loads a valid config', () => {
    const config = loadConfig(baseEnv)
    expect(config.oidcIssuerUrl).toBe('https://auth.example.com/application/o/test/')
    expect(config.allowSubs).toEqual(['user-uuid-1'])
    expect(config.port).toBe(8080)
    expect(config.rateLimitRpm).toBe(60)
  })

  it('parses comma-separated allow-lists', () => {
    const config = loadConfig({ ...baseEnv, ALLOW_SUBS: 'a,b,c', ALLOW_EMAILS: 'x@y.com' })
    expect(config.allowSubs).toEqual(['a', 'b', 'c'])
    expect(config.allowEmails).toEqual(['x@y.com'])
  })

  it('rejects missing required vars', () => {
    expect(() => loadConfig({})).toThrow(/OIDC_ISSUER_URL/i)
  })

  it('rejects empty allow-lists across the board', () => {
    const { ALLOW_SUBS: _drop, ...rest } = baseEnv
    expect(() => loadConfig(rest)).toThrow(/at least one of ALLOW_SUBS, ALLOW_EMAILS, ALLOW_GROUPS/)
  })

  it('rejects both MCP_UPSTREAM_URL and MCP_SPAWN_CMD together', () => {
    expect(() => loadConfig({ ...baseEnv, MCP_SPAWN_CMD: 'echo hi' })).toThrow(
      /exactly one of MCP_UPSTREAM_URL or MCP_SPAWN_CMD/,
    )
  })

  it('accepts MCP_SPAWN_CMD alone with MCP_SPAWN_PORT', () => {
    const { MCP_UPSTREAM_URL: _drop, ...rest } = baseEnv
    const config = loadConfig({ ...rest, MCP_SPAWN_CMD: 'npx test-server', MCP_SPAWN_PORT: '8765' })
    expect(config.mcpSpawnCmd).toBe('npx test-server')
    expect(config.mcpSpawnPort).toBe(8765)
  })

  it('parses PORT and RATE_LIMIT_RPM as numbers', () => {
    const config = loadConfig({ ...baseEnv, PORT: '9000', RATE_LIMIT_RPM: '120' })
    expect(config.port).toBe(9000)
    expect(config.rateLimitRpm).toBe(120)
  })

  it('parses CORS_ALLOW_ORIGINS env var', () => {
    const config = loadConfig({ ...baseEnv, CORS_ALLOW_ORIGINS: 'https://claude.ai,https://app.example.com' })
    expect(config.allowOrigins).toEqual(['https://claude.ai', 'https://app.example.com'])
  })

  it('defaults CORS allow-origins to claude.ai and claude.com', () => {
    const config = loadConfig(baseEnv)
    expect(config.allowOrigins).toEqual(['https://claude.ai', 'https://claude.com'])
  })
})
