# Example: samsung-health-mcp behind Authentik

Wraps [samsung-health-mcp-unofficial](https://www.npmjs.com/package/samsung-health-mcp-unofficial) with OAuth backed by [Authentik](https://goauthentik.io).

## 1. Configure Authentik

1. Create an OAuth2/OIDC Provider:
   - Name: `samsung-health-mcp`
   - Redirect URIs: `https://claude.ai/api/mcp/auth_callback` (verify the exact URL with a spike — see project spec)
   - Issuer mode: per-provider
   - Signing key: any RSA/ES key configured in Authentik
2. Create matching Application with slug `samsung-health-mcp` linked to the provider.
3. Note the issuer URL: `https://YOUR-AUTHENTIK/application/o/samsung-health-mcp/`
4. Note your user's `sub` UUID from the Authentik users page.

## 2. Run the proxy

```bash
docker run -p 8080:8080 \
  -e OIDC_ISSUER_URL=https://YOUR-AUTHENTIK/application/o/samsung-health-mcp/ \
  -e OIDC_AUDIENCE=samsung-health-mcp \
  -e RESOURCE_URL=https://samsung-health.YOUR-DOMAIN \
  -e ALLOW_SUBS=YOUR-AUTHENTIK-USER-SUB \
  -e MCP_SPAWN_CMD="npx -y samsung-health-mcp-unofficial --transport http --port 8765" \
  -e MCP_SPAWN_PORT=8765 \
  -e SAMSUNG_HEALTH_EXPORT_PATH=/data/samsung-health/export.zip \
  -e SAMSUNG_HEALTH_PRIVACY_MODE=raw \
  -v $(pwd)/data:/data/samsung-health \
  ghcr.io/allardy/mcp-oauth-proxy:latest
```

Drop your Samsung Health export at `./data/export.zip`.

## 3. Add to Claude.ai

Claude.ai → Settings → Connectors → Add custom connector. Enter `https://samsung-health.YOUR-DOMAIN`. Follow the OAuth flow.
