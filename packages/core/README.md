# `@neverdown/core`

Shared NeverDown logic.

| Chunk | Module |
|---|---|
| C0 | `neverdownIdentity()` |
| **C2** | `src/x402/` — Hedera buyer (`payForRpcOnce`, `loadBuyerConfig`) |
| **C3** | `src/policy/` + `src/hcs/` — authorize-before-sign + HCS audit |
| C4+ | Arkiv, ENS, PoC, agent |

## Quick use

```bash
pnpm --filter @neverdown/core test
pnpm pay:once       # C2; needs .env spend keys + sellers running
pnpm policy:smoke   # C3 authorization smoke
pnpm hcs:smoke      # C3 live HCS (operator + topic)
```

Details: [docs/C2-PAY-ONCE.md](../../docs/C2-PAY-ONCE.md) · [docs/C3-POLICY-HCS.md](../../docs/C3-POLICY-HCS.md) · [docs/BUILD-CHUNKS.md](../../docs/BUILD-CHUNKS.md).
