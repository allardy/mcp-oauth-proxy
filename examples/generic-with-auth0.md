# Example: any MCP behind Auth0

Wraps any HTTP-transport MCP with Auth0 as the authorization server.

## 1. Configure Auth0

1. Auth0 dashboard → APIs → Create API:
   - Name: `My MCP`
   - Identifier (audience): `https://mcp.my-domain.com`
2. Auth0 → Applications → Create:
   - Type: Regular Web Application (if using pre-registered) or enable Dynamic Application Registration if your MCP client supports it
   - Allowed Callback URLs: whatever your MCP client uses (Claude.ai uses `https://claude.ai/api/mcp/auth_callback`)
3. Note the Auth0 domain (e.g., `your-tenant.us.auth0.com`).

## 2. Run the proxy

```bash
docker run -p 8080:8080 \
  -e OIDC_ISSUER_URL=https://your-tenant.us.auth0.com/ \
  -e OIDC_AUDIENCE=https://mcp.my-domain.com \
  -e RESOURCE_URL=https://mcp.my-domain.com \
  -e ALLOW_EMAILS=you@example.com,colleague@example.com \
  -e MCP_UPSTREAM_URL=http://my-mcp-host:8765 \
  ghcr.io/allardy/mcp-oauth-proxy:latest
```
