# How NeverDown uses Arkiv

1. Seed a **v2** capability offer (`pnpm arkiv:seed` with `.env.arkiv-seed`)
2. Query live offers by `category` + `maxPriceTinybars` (`pnpm arkiv:query`)
3. Agent selects the cheapest matching offer
4. Resolve `sellerens` via ENS (allowlist + `hederaAccount` / `x402Url`)
5. PoC against `probeurl`
6. Pay via payment worker at `purchaseurl` under policy
7. Install `rpcurl` as gateway standby

## Fields that drive user-visible choices

| Field | User-visible effect |
|---|---|
| `pricetinybars` | Cheapest valid offer wins |
| `sellerens` | Identity shown in evidence / allowlist gate |
| `payto` | Who gets paid (must match ENS) |
| `probeurl` / `purchaseurl` / `rpcurl` | Separate probe, buy, and serve URLs |
| `expiresat` / protocol expiry | Stale capacity disappears from discovery |

Explorer: https://rabdi.explorer.arkiv.network
