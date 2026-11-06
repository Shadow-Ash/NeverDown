# NeverDown — Arkiv capability offer schema (C5)

Schema name: `neverdown.capabilityofferv2` (reseed after upgrading; old offers are ignored)

Wallet-owned, expiring **offers** the resilience agent discovers when a failure spot needs replacement capacity. Hackathon demo category: `rpc` (not the product ceiling).

## Columns

| Attribute | Type | Indexed | Meaning |
|---|---|---|---|
| `sellerens` | str | yes | Seller ENS name (resolved in C6) |
| `serviceurl` | str | no | Endpoint the buyer will call after pay |
| `schemaversion` | u64 | no | Must be `2` |
| `probeurl` | str | no | Bounded public capability probe |
| `purchaseurl` | str | no | x402 purchase endpoint for a bounded entitlement |
| `rpcurl` | str | no | Authenticated JSON-RPC endpoint used by the gateway |
| `pricetinybars` | u64 | yes | Exact x402 price in tinybars |
| `chainid` | u64 | yes | Target app chain (e.g. Sepolia `11155111`) |
| `category` | str | yes | Capability class (`rpc`, later indexer / price / …) |
| `payto` | str | yes | Hedera account id that receives payment |
| `expiresat` | str | no | ISO timestamp (app hint; protocol also uses `$expiresAt`) |

## Ownership & expiry

- **Owner:** the Arkiv writer wallet (`ARKIV_PRIVATE_KEY` address).
- **Protocol expiry:** set via `ExpirationTime` on create; after `$expiresAt`, queries omit the entity.
- **Seed set:** good-A, good-B (7 days), expired-C (≈4 seconds then dropped).

## Queries that matter

`discoverOffers({ category, maxPriceTinybars })` → live offers only, price ≤ cap.

Explorer: https://rabdi.explorer.arkiv.network
