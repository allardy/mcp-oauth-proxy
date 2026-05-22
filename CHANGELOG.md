# Changelog

## 0.3.3

- fix: scope `express.json()` to `/oauth/register` only — global body parser was draining proxied request bodies before http-proxy-3 could forward them, causing upstream MCP to see "request aborted"

## 0.3.2

- fix: accept JWT `iss` claim with or without trailing slash — Authentik appends a trailing `/` to issuer URLs; jose's exact-match rejected the stripped-slash form

## 0.3.1

- fix: preserve upstream `issuer` in proxied `/.well-known/oauth-authorization-server` metadata — previous version rewrote it to the proxy URL, which broke JWT validation because tokens are still signed by the upstream IdP with its own `iss`

## 0.3.0

- feat: proxy advertises itself as the authorization server (`authorization_servers` self-references); MCP clients fetch `/.well-known/oauth-authorization-server` from the proxy rather than going directly to the upstream IdP
- feat: RFC 6750 error params in `WWW-Authenticate` response header on 401s

## 0.2.0

- feat: static DCR shim — `POST /oauth/register` returns pre-configured `STATIC_CLIENT_ID`/`STATIC_CLIENT_SECRET` for OIDC providers that don't support open Dynamic Client Registration (e.g. Authentik); `registration_endpoint` is injected into the auth-server discovery doc when the pair is set
- feat: `MCP_UPSTREAM_PATH` — optional path suffix forwarded to the upstream MCP when it doesn't listen at root (e.g. `/mcp`)

## 0.1.2

- feat: per-request structured logging (method, path, status, latency, origin, UA) for easier debugging

## 0.1.1

- fix: CORS support — Claude.ai is a browser-context client; OPTIONS preflights were getting 401'd before this

## 0.1.0

- Initial release: JWT verification via OIDC discovery + JWKS, allow-list gating (sub / email / group), protected-resource discovery doc, per-sub rate limiting, HTTP proxy and process-spawn modes, Dockerfile, CI/release pipeline
