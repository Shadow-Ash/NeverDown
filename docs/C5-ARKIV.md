# C5 — Arkiv capability offers

Discovery rail for NeverDown: seed and query **expiring, wallet-owned** offers on Arkiv Rabdi.

## Setup

1. Create / fund a Rabdi wallet (tGLM): https://hub.arkiv.network/faucet  
2. Access key: https://hub.arkiv.network/access-keys  
3. Root `.env` for the seed writer (never commit it). Set `SELLER_ENS_NAME`, `SELLER_URL`, `HEDERA_MERCHANT_ACCOUNT_ID`, `HEDERA_X402_PRICE_SMALLEST_UNITS`, and `POC_EXPECTED_CHAIN_ID` to the real seller. The ENS name must already resolve with matching `hederaAccount` and `x402Url` text records.

```env
ARKIV_RPC=https://rpc.rabdi.db-chain.testnet.arkiv.network
ARKIV_CHAIN_ID=7794095
ARKIV_ACCESS_KEY=your_hub_key
ARKIV_PRIVATE_KEY=0xyour_funded_private_key
```

## Run

```bash
pnpm arkiv:seed    # writes one validated seven-day v2 RPC offer
pnpm arkiv:query   # prints ≥1 live offer with entityKey
```

Hermetic filter tests: `pnpm --filter @neverdown/core test`

## Code map

| Path | Role |
|---|---|
| `packages/core/src/arkiv/` | Schema, clients, `discoverOffers`, seed helper |
| `scripts/seed-arkiv.ts` / `query-arkiv.ts` | Live gate |
| `arkiv/schema.md` | Judge-facing schema notes |
