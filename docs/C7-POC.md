# C7 — Proof-of-Capability

Before NeverDown **installs** a candidate as standby, `proofOfCapability` verifies it is usable **now**.

## Checks

1. `eth_chainId` matches expected  
2. Block freshness vs reference RPC (`POC_REFERENCE_RPC` or candidate)  
3. Smoke: `eth_getBlockByNumber("latest")`  
4. Latency under threshold  
5. Offer `payTo` matches ENS `hederaAccount`  

Returns `{ pass, checks[] }`. **Fail ⇒ never install.**

## Run

```bash
pnpm --filter @neverdown/core test   # includes poc.test.ts
pnpm poc:smoke                       # good pass + wrong chain + stale fail
```

Optional live: set `POC_CANDIDATE_RPC` / `RPC_UPSTREAM_URL` and `POC_REFERENCE_RPC`.

## Code

`packages/core/src/poc/` · `scripts/poc-smoke.ts`
