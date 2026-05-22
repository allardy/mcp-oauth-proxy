import { createServer, type Server } from 'node:http'
import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose'

export type OidcFixture = {
  issuerUrl: string
  jwksUrl: string
  signToken: (claims: Record<string, unknown>, opts?: { expiresIn?: string; audience?: string }) => Promise<string>
  rotateKey: () => Promise<void>
  close: () => Promise<void>
}

export const startOidcFixture = async (): Promise<OidcFixture> => {
  let { privateKey, publicKey } = await generateKeyPair('RS256')
  let jwk: JWK & { kid: string } = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }

  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith('/.well-known/openid-configuration')) {
      const issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        }),
      )
      return
    }
    if (req.url === '/jwks') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const issuerUrl = `http://127.0.0.1:${port}`

  return {
    issuerUrl,
    jwksUrl: `${issuerUrl}/jwks`,
    signToken: async (claims, opts = {}) => {
      const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
        .setIssuer(issuerUrl)
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? '5m')
      if (opts.audience) jwt.setAudience(opts.audience)
      return jwt.sign(privateKey)
    },
    rotateKey: async () => {
      const next = await generateKeyPair('RS256')
      privateKey = next.privateKey
      publicKey = next.publicKey
      jwk = { ...(await exportJWK(publicKey)), kid: `k${Date.now()}`, alg: 'RS256', use: 'sig' }
    },
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}
