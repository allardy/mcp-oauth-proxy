# Example: samsung-health-mcp behind Authentik

Wraps [samsung-health-mcp-unofficial](https://www.npmjs.com/package/samsung-health-mcp-unofficial) with OAuth backed by [Authentik](https://goauthentik.io).

This is the battle-tested configuration that makes Claude.ai's "Add custom connector" flow work end-to-end with Authentik — including the static DCR shim (Authentik doesn't support open Dynamic Client Registration) and the `/mcp` path rewrite.

## 1. Configure Authentik

1. Create an OAuth2/OIDC Provider:
   - Name: `samsung-health-mcp`
   - Redirect URIs: `https://claude.ai/api/mcp/auth_callback`
   - Issuer mode: per-provider
   - Signing key: any RSA/ES key configured in Authentik
   - Note the **client ID** and **client secret** from the provider's credentials section.
2. Create a matching Application with slug `samsung-health-mcp` linked to the provider.
3. Note the issuer URL: `https://YOUR-AUTHENTIK/application/o/samsung-health-mcp/`
4. Note your user's `sub` UUID from the Authentik users page (Admin → Users → pick user → copy the UUID shown as "User's ID").

## 2. Run the proxy

```bash
docker run -p 8080:8080 \
  -e OIDC_ISSUER_URL=https://YOUR-AUTHENTIK/application/o/samsung-health-mcp/ \
  -e OIDC_AUDIENCE=samsung-health-mcp \
  -e RESOURCE_URL=https://samsung-health.YOUR-DOMAIN \
  -e ALLOW_SUBS=YOUR-AUTHENTIK-USER-SUB \
  -e MCP_SPAWN_CMD="npx -y samsung-health-mcp-unofficial" \
  -e MCP_SPAWN_PORT=8765 \
  -e MCP_UPSTREAM_PATH=/mcp \
  -e STATIC_CLIENT_ID=YOUR-AUTHENTIK-CLIENT-ID \
  -e STATIC_CLIENT_SECRET=YOUR-AUTHENTIK-CLIENT-SECRET \
  -e SAMSUNG_HEALTH_MCP_TRANSPORT=http \
  -e SAMSUNG_HEALTH_MCP_PORT=8765 \
  -e SAMSUNG_HEALTH_EXPORT_PATH=/data/export.zip \
  -e SAMSUNG_HEALTH_PRIVACY_MODE=raw \
  -v $(pwd)/data:/data \
  ghcr.io/allardy/mcp-oauth-proxy:latest
```

Drop your Samsung Health export at `./data/export.zip`.

**Key env vars explained:**

| Variable                            | Why it's needed                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_UPSTREAM_PATH=/mcp`            | `samsung-health-mcp-unofficial` listens at `/mcp`, not `/`. Without this the proxy forwards to `/` and the MCP gets nothing.                                  |
| `STATIC_CLIENT_ID/SECRET`           | Authentik doesn't support open DCR. The proxy hosts `/oauth/register` returning these pre-configured credentials so Claude.ai's connector setup can complete. |
| `SAMSUNG_HEALTH_MCP_TRANSPORT=http` | Tells the MCP package to start its HTTP transport (required when spawned this way).                                                                           |
| `SAMSUNG_HEALTH_MCP_PORT=8765`      | Port the MCP package's HTTP server listens on — must match `MCP_SPAWN_PORT`.                                                                                  |

## 3. Add to Claude.ai

Claude.ai → Settings → Connectors → Add custom connector. Enter `https://samsung-health.YOUR-DOMAIN`. Claude.ai will:

1. Fetch `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` from the proxy.
2. Call `POST /oauth/register` on the proxy (gets back your pre-configured Authentik client credentials).
3. Redirect you to Authentik's `/authorize` endpoint to log in.
4. Use the resulting bearer token on all subsequent MCP calls, which the proxy verifies and forwards to the spawned MCP process.
