# Local development

## Requirements
- Node.js 20 or newer (Node 22 LTS recommended)
- npm (included with Node.js)

The repository is a pnpm workspace. npm is provided as a convenience for common workflows; the canonical workspace lockfile remains pnpm 9.15.0.

## Quick start (npm)
From the repository root:
```bash
npm install
npm run dev
```
Open http://localhost:3000. This starts only the web server, not the gateway/seller or live payment services.

Build and run:
```bash
npm run build
npm start
```

## Full local demo
Configure ignored .env.agent and .env.seller files from the examples. Start services separately:

Terminal 1 — Gateway:
```bash
pnpm gateway:live
```
Terminal 2 — Seller:
```bash
pnpm seller:live
```
Terminal 3 — Web console:
```bash
pnpm web:dev
```
Terminal 4 — optional coordinator:
```bash
pnpm coordinator:live
```

Open http://localhost:3000. Default gateway and seller ports are 8787 and 4001 unless overridden.

To run gateway, seller and web together use `npm run dev:stack` or `pnpm dev:stack`. Separate terminals are easier to debug.

## Checks and safe demos
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:web
pnpm test:smoke
pnpm build
pnpm agent:demo --scenario procure
pnpm agent:demo --scenario deny
pnpm poc:smoke
```

Live acceptance requires testnet credentials and can spend testnet HBAR. Read [LIVE-BACKEND-ACCEPTANCE.md](LIVE-BACKEND-ACCEPTANCE.md) first. Never commit environment files or keys.
