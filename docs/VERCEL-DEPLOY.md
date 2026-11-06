# Vercel console preview

Production URL: https://neverdown-nu.vercel.app

The Vercel project serves `apps/web/public` as a static website. It includes the five-card console, theme toggle, Redaction font, and logo assets. No Hedera, Arkiv, or signing credentials are sent to Vercel.

The hosted preview intentionally labels live gateway status and agent actions as local-only. The backend uses a continuously running gateway/coordinator and persistent SQLite ledgers; these services are not deployed with this static site. Vercel Functions do not provide shared persistent SQLite storage. Do not describe the Vercel preview as a live resilience operator.

The first production deployment was verified on 2026-11-06: `/`, `/light-nd.png`, `/dark-nd.png`, and `/fonts/Redaction50-Regular.woff2` all returned HTTP 200. The deployment project is `neverdown` in the `dhanushs-projects-155e2530` Vercel scope.

To update the hosted console using the connected Vercel CLI project:

```bash
vercel --cwd apps/web/public
vercel --cwd apps/web/public --prod
```

Run the backend locally with the separate profiles described in `docs/LIVE-BACKEND-ACCEPTANCE.md`. A later production deployment needs an always-on backend host, persistent database, protected internal gateway API, and a public API design before the console controls can operate remotely.
