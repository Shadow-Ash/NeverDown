# C2 — Hedera x402 pay-once

Autonomous buyer that pays the C1 NeverDown RPC merchant on **Hedera testnet** and prints a HashScan transaction id.

## Prerequisites

1. Node 20+ and `pnpm install` from repo root.
2. Sellers env set (`HEDERA_MERCHANT_ACCOUNT_ID`, etc.) — see [apps/sellers/README.md](../apps/sellers/README.md).
3. **Buyer** env in root `.env`:
   - `HEDERA_SPEND_ID` — testnet account id `0.0.N`
   - `HEDERA_SPEND_KEY` — private key for that account (never commit)
   - optional `SELLER_URL=http://localhost:4001`
4. Fund the spend account via [Hedera Portal](https://portal.hedera.com/) faucet (enough for several `10000` tinybar payments).

If spend vars are empty, `pnpm pay:once` exits with a clear error naming the missing variable (the private key is never printed).

## Run

Terminal A — start merchant:

```bash
pnpm --filter @neverdown/sellers dev
```

Terminal B — pay once (no human approve):

```bash
pnpm pay:once
```

Expected output includes:

- JSON-RPC `result`
- `Hedera transactionId` (e.g. `0.0.x@seconds.nanos`)
- `HashScan: https://hashscan.io/testnet/transaction/...`

Open the HashScan URL to confirm settlement.

## Tests

```bash
pnpm --filter @neverdown/core test      # hermetic buyer tests (mocked fetch — not live settle)
pnpm --filter @neverdown/sellers test   # C1 suite must stay green
```

## Code map

| Path | Role |
|---|---|
| `packages/core/src/x402/` | Buyer config, `x402HTTPClient`, `payForRpcOnce` |
| `scripts/pay-once.ts` | Live CLI gate |
| `apps/sellers` | C1 merchant (unchanged settle path via middleware) |

Live settle is Hedera **testnet** only for C2.
