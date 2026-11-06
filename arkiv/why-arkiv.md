# Why Arkiv for NeverDown

NeverDown needs a **discovery rail** for replacement capacity that is:

- **Wallet-owned** — sellers publish offers; NeverDown does not silently rewrite inventory in a shared admin DB
- **Expiring** — stale offers drop out of queries after protocol `$expiresAt`
- **Queryable** — agent filters by `category` + `maxPriceTinybars` before ENS / PoC / pay

Postgres can store rows, but it does not give judges a public, wallet-scoped, expiring marketplace primitive. Arkiv does.

Hackathon demo category is `rpc` (schema v2 with `probeurl` / `purchaseurl` / `rpcurl`). The same offer shape generalizes to other failure spots later.
