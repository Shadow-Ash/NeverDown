# Local development

## Requirements
- Node.js 20 or newer (Node 22 LTS recommended)
- npm (included with Node.js)

The repository supports npm workspaces and retains pnpm 9.15.0 as the canonical locked workspace manager.

## Quick start (npm)
From the repository root:
```bash
npm install
npm run dev
```
Open http://localhost:3000. This starts only the web server; it does not start gateway/seller processes or trigger live payments.

Build and start the compiled web server:
```bash
npm run build
npm start
```

## Canonical pnpm setup
```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

## Full local demo
Configure the ignored .env.agent and .env.seller files from their example templates. Run each service in a separate terminal:

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

Open http://localhost:3000. Defaults are gateway port 8787 and seller port 4001 unless overridden.

## Checks and safe demos
```bash
npm test
npm run lint
npm run typecheck
npm run build
pnpm test:smoke
pnpm agent:demo --scenario procure
pnpm agent:demo --scenario deny
pnpm poc:smoke
```

Live acceptance requires testnet credentials and may spend testnet HBAR. Read [LIVE-BACKEND-ACCEPTANCE.md](LIVE-BACKEND-ACCEPTANCE.md) first. Never commit environment files or keys.
