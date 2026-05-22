# mcp-oauth-proxy

OAuth bearer-token wrapper for HTTP-transport MCP servers. Resource-server only — bring your own OIDC provider.

**What it does:** Sits in front of any HTTP-transport [Model Context Protocol](https://modelcontextprotocol.io) server and gates traffic on bearer JWTs issued by your OIDC provider (Authentik, Auth0, Keycloak, Okta, Google, etc.). Allows MCP servers that were designed for local trust-the-socket use to be exposed publicly to clients like Claude.ai.

**What it does NOT do:** Issue tokens. That's your OIDC provider's job. This proxy validates tokens; it does not host login UIs or run an OAuth dance with end users.

## How it fits

```
         ┌──────────────────┐         ┌──────────────────┐
         │   Claude.ai web  │ ─────▶  │  OIDC Provider   │
         │  (or any MCP     │         │  (Authentik etc) │
         │   client)        │         └──────────────────┘
         └────────┬─────────┘                  │
                  │ Bearer <jwt>               │ issues tokens
                  ▼                            │
         ┌──────────────────┐                  │
         │  mcp-oauth-proxy │◀─── JWKS ────────┘
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
pnpm add mcp-oauth-proxy
```

```ts
import { buildApp } from 'mcp-oauth-proxy'

const app = buildApp({ /* ...same shape as env vars... */ })
app.listen(8080)
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `OIDC_ISSUER_URL` | yes | OIDC discovery URL (anything ending in / where /.well-known/openid-configuration resolves). |
| `OIDC_AUDIENCE` | yes | Expected `aud` claim. |
| `RESOURCE_URL` | yes | This proxy's public URL. Used in the protected-resource discovery doc. |
| `ALLOW_SUBS` | one of these | Comma-separated allow-list of token `sub` values. |
| `ALLOW_EMAILS` | | Comma-separated allow-list of token `email` values. |
| `ALLOW_GROUPS` | | Comma-separated allow-list of token `groups` claim values. |
| `MCP_UPSTREAM_URL` | xor | Existing HTTP MCP to proxy to. |
| `MCP_SPAWN_CMD` | xor | Command to spawn as a child process. |
| `MCP_SPAWN_PORT` | with cmd | Port the spawned MCP listens on. |
| `PORT` | no | Default 8080. |
| `LOG_LEVEL` | no | `trace` to `fatal`. Default `info`. |
| `RATE_LIMIT_RPM` | no | Per-`sub` rate limit. Default 60. |

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
