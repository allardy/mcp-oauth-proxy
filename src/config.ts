import { z } from 'zod'

const csv = (raw: string | undefined) =>
  raw
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? []

const envSchema = z
  .object({
    OIDC_ISSUER_URL: z.string().url(),
    OIDC_AUDIENCE: z.string().min(1),
    RESOURCE_URL: z.string().url(),
    ALLOW_SUBS: z.string().optional(),
    ALLOW_EMAILS: z.string().optional(),
    ALLOW_GROUPS: z.string().optional(),
    MCP_UPSTREAM_URL: z.string().url().optional(),
    MCP_SPAWN_CMD: z.string().min(1).optional(),
    MCP_SPAWN_PORT: z.coerce.number().int().positive().optional(),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
  })
  .refine((env) => csv(env.ALLOW_SUBS).length + csv(env.ALLOW_EMAILS).length + csv(env.ALLOW_GROUPS).length > 0, {
    message: 'at least one of ALLOW_SUBS, ALLOW_EMAILS, ALLOW_GROUPS must be set',
  })
  .refine((env) => Boolean(env.MCP_UPSTREAM_URL) !== Boolean(env.MCP_SPAWN_CMD), {
    message: 'set exactly one of MCP_UPSTREAM_URL or MCP_SPAWN_CMD, not both',
  })
  .refine((env) => !env.MCP_SPAWN_CMD || env.MCP_SPAWN_PORT, {
    message: 'MCP_SPAWN_PORT is required when MCP_SPAWN_CMD is set',
  })

export type Config = {
  oidcIssuerUrl: string
  oidcAudience: string
  resourceUrl: string
  allowSubs: string[]
  allowEmails: string[]
  allowGroups: string[]
  mcpUpstreamUrl: string | undefined
  mcpSpawnCmd: string | undefined
  mcpSpawnPort: number | undefined
  port: number
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  rateLimitRpm: number
}

export const loadConfig = (env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Config => {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
    // Build a message that includes field paths so tests can match on variable names
    const detail = issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ')
    throw new Error(`Config validation failed: ${detail}`)
  }
  const parsed = result.data
  return {
    oidcIssuerUrl: parsed.OIDC_ISSUER_URL,
    oidcAudience: parsed.OIDC_AUDIENCE,
    resourceUrl: parsed.RESOURCE_URL,
    allowSubs: csv(parsed.ALLOW_SUBS),
    allowEmails: csv(parsed.ALLOW_EMAILS),
    allowGroups: csv(parsed.ALLOW_GROUPS),
    mcpUpstreamUrl: parsed.MCP_UPSTREAM_URL,
    mcpSpawnCmd: parsed.MCP_SPAWN_CMD,
    mcpSpawnPort: parsed.MCP_SPAWN_PORT,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    rateLimitRpm: parsed.RATE_LIMIT_RPM,
  }
}
