import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

export type JwtVerifierOptions = {
  issuerUrl: string
  audience: string
}

export const createJwtVerifier = (opts: JwtVerifierOptions) => {
  const configUrl = new URL('.well-known/openid-configuration', ensureTrailingSlash(opts.issuerUrl))
  // cooldownDuration: 0 ensures the JWKS is re-fetched immediately when an unknown kid appears (key rotation).
  const remoteJwksPromise = fetchJwksUri(configUrl).then((uri) =>
    createRemoteJWKSet(new URL(uri), { cooldownDuration: 0 }),
  )
  // Suppress unhandled-rejection at construction time; the error surfaces properly
  // when `verify()` is called and `await remoteJwksPromise` re-throws inside the
  // auth middleware's try/catch, returning 401 instead of crashing the process.
  remoteJwksPromise.catch(() => undefined)

  return async (token: string): Promise<JWTPayload> => {
    const jwks = await remoteJwksPromise
    const { payload } = await jwtVerify(token, jwks, {
      issuer: opts.issuerUrl.replace(/\/$/, ''),
      audience: opts.audience,
    })
    return payload
  }
}

const ensureTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)

const fetchJwksUri = async (configUrl: URL): Promise<string> => {
  const res = await fetch(configUrl)
  if (!res.ok) throw new Error(`failed to fetch OIDC config from ${configUrl}: ${res.status}`)
  const json = (await res.json()) as { jwks_uri?: string }
  if (!json.jwks_uri) throw new Error(`OIDC config at ${configUrl} missing jwks_uri`)
  return json.jwks_uri
}
