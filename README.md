# mcp-oauth-proxy

OAuth bearer-token wrapper for HTTP-transport MCP servers. Resource-server only — bring your own OIDC provider.

**What it does:** Sits in front of any HTTP-transport [Model Context Protocol](https://modelcontextprotocol.io) server and gates traffic on bearer JWTs issued by your OIDC provider (Authentik, Auth0, Keycloak, Okta, Google, etc.). Allows MCP servers that were designed for local trust-the-socket use to be exposed publicly to clients like Claude.ai.

**What it does NOT do:** Issue tokens. That's your OIDC provider's job. This proxy validates tokens; it does not host login UIs or run an OAuth dance with end users.

## How it fits

The proxy advertises itself as **both** the resource server and the authorization server (RFC 8414). MCP clients (e.g. Claude.ai) discover the proxy's `/.well-known/oauth-authorization-server`, which rewrites `issuer` to match the proxy's URL. The actual `authorize` and `token` endpoints still point at the upstream IdP — clients follow those URLs directly. Token verification uses the upstream's JWKS (tokens carry `iss=upstream`; the JWT verifier is already configured with the upstream issuer URL).

```
         ┌──────────────────┐         ┌──────────────────┐
         │   Claude.ai web  │ ──(2)──▶│  OIDC Provider   │
         │  (or any MCP     │         │  (Authentik etc) │
         │   client)        │         └──────────────────┘
         └────────┬─────────┘                  │
          (1) discovers proxy's                │ issues tokens
              .well-known/ docs                │ JWKS
                  │                            │
                  │ (3) Bearer <jwt>            │
                  ▼                            │
         ┌──────────────────┐                  │
         │  mcp-oauth-proxy │◀─── JWKS ────────┘
         │  - auth-server   │
         │    (rewrites      │
         │     issuer)       │
         │  - verifies JWT  │
         │  - allow-list    │
         │  - rate-limits   │
         └────────┬─────────┘
                  │ proxied (no auth headers)
                  ▼
         ┌──────────────────┐
         │   Your MCP       │
         │   (HTTP)         │
         └──────────────────┘
```

## Quick start

### As a Docker container

```bash
docker run --rm -p 8080:8080 \
  -e OIDC_ISSUER_URL=https://auth.example.com/application/o/my-mcp/ \
  -e OIDC_AUDIENCE=my-mcp \
  -e RESOURCE_URL=https://mcp.example.com \
  -e ALLOW_SUBS=your-user-uuid \
  -e MCP_SPAWN_CMD="npx -y your-mcp-server --transport http --port 8765" \
  -e MCP_SPAWN_PORT=8765 \
  ghcr.io/allardy/mcp-oauth-proxy:latest
```

### As an npm package (programmatic)

```bash
pnpm add @allardy/mcp-oauth-proxy
```

```ts
import { buildApp } from '@allardy/mcp-oauth-proxy'

const app = buildApp({
  /* ...same shape as env vars... */
})
app.listen(8080)
```

## Configuration

| Variable               | Required     | Description                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | yes          | OIDC discovery URL (anything ending in / where /.well-known/openid-configuration resolves).                                                                                                                                                                                       |
| `OIDC_AUDIENCE`        | yes          | Expected `aud` claim.                                                                                                                                                                                                                                                             |
| `RESOURCE_URL`         | yes          | This proxy's public URL. Used in the protected-resource discovery doc.                                                                                                                                                                                                            |
| `ALLOW_SUBS`           | one of these | Comma-separated allow-list of token `sub` values.                                                                                                                                                                                                                                 |
| `ALLOW_EMAILS`         |              | Comma-separated allow-list of token `email` values.                                                                                                                                                                                                                               |
| `ALLOW_GROUPS`         |              | Comma-separated allow-list of token `groups` claim values.                                                                                                                                                                                                                        |
| `MCP_UPSTREAM_URL`     | xor          | Existing HTTP MCP to proxy to.                                                                                                                                                                                                                                                    |
| `MCP_SPAWN_CMD`        | xor          | Command to spawn as a child process.                                                                                                                                                                                                                                              |
| `MCP_SPAWN_PORT`       | with cmd     | Port the spawned MCP listens on.                                                                                                                                                                                                                                                  |
| `PORT`                 | no           | Default 8080.                                                                                                                                                                                                                                                                     |
| `LOG_LEVEL`            | no           | `trace` to `fatal`. Default `info`.                                                                                                                                                                                                                                               |
| `RATE_LIMIT_RPM`       | no           | Per-`sub` rate limit. Default 60.                                                                                                                                                                                                                                                 |
| `CORS_ALLOW_ORIGINS`   | no           | Comma-separated allowed browser origins for CORS. Default: `https://claude.ai,https://claude.com`. Use `*` to allow any origin.                                                                                                                                                   |
| `STATIC_CLIENT_ID`     | no           | OIDC providers that don't support open DCR can use this pair. The proxy hosts a `/oauth/register` endpoint that always returns these credentials to any caller, and the `oauth-authorization-server` discovery doc advertises this endpoint. Useful for Authentik, etc.           |
| `STATIC_CLIENT_SECRET` | no           | See `STATIC_CLIENT_ID`. Both must be set together or both left unset.                                                                                                                                                                                                             |
| `MCP_UPSTREAM_PATH`    | no           | Optional path on the upstream. All non-discovery, non-healthz, non-oauth-register requests are forwarded to `${MCP_UPSTREAM_URL}${MCP_UPSTREAM_PATH}` (or the spawned upstream URL). Use when the upstream MCP listens at a sub-path like `/mcp` but the proxy is exposed at `/`. |
| `SCOPES_SUPPORTED`     | no           | Comma-separated list of OAuth scopes the resource server supports. Advertised in both the protected-resource and auth-server discovery docs. Defaults to `openid,profile,email,offline_access`.                                                                                   |

## Working with OIDC providers that don't support DCR

Some OIDC providers (including Authentik 2025.10.x) don't advertise a `registration_endpoint` in their discovery doc and don't support open Dynamic Client Registration (RFC 7591). Claude.ai's "Add custom connector" flow requires DCR — if the discovery doc doesn't advertise `registration_endpoint`, it silently gives up.

**Workaround:** pre-create an OIDC application in your provider (Authentik: Applications → Providers → OAuth2/OpenID Connect), then configure the proxy with the resulting client_id and client_secret:

```bash
STATIC_CLIENT_ID=your-client-id
STATIC_CLIENT_SECRET=your-client-secret
```

The proxy will:

1. Host `POST /oauth/register` — returns your pre-configured credentials to any caller (no validation of the request body beyond parsing it).
2. Inject `registration_endpoint` into the proxy's `/.well-known/oauth-authorization-server` discovery doc (with `issuer` rewritten to the proxy's own URL) so clients see DCR as available.

The upstream provider's redirect_uri whitelist still governs which callbacks are accepted at `/authorize` time, so adding only the real Claude.ai callback URL to the whitelist is the correct security boundary.

**Note on issuer rewriting:** The proxy rewrites `issuer` in the `/.well-known/oauth-authorization-server` response to its own `RESOURCE_URL`. This satisfies RFC 8414's requirement that the `issuer` value matches the URL from which the metadata was fetched. The `authorize` and `token` endpoint URLs remain pointing at the upstream IdP — MCP clients follow those directly. JWT tokens still carry the upstream's `iss` claim and the proxy's JWT verifier is configured accordingly.

## Security model

- **Resource-server only** — does not initiate OAuth flows or maintain user state.
- **Allow-list gating** — even after JWT verification, the request is rejected unless the token's `sub`, `email`, or one of its `groups` matches a configured list.
- **Per-`sub` rate limiting** — default 60 req/min as defense-in-depth.
- **Audit log** — every authenticated request is logged at info level (sub, method, path, ts).

**Suitable for:** personal deployments, small-team MCPs, internal tools.
**Not suitable for:** multi-tenant SaaS — allow-list and rate-limit are per-process; use a real authorization service for that.

## Examples

- [Samsung Health MCP behind Authentik](examples/samsung-health-with-authentik.md)
- [Any MCP behind Auth0](examples/generic-with-auth0.md)

## License

MIT
