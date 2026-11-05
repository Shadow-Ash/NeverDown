# `@neverdown/core`

Shared NeverDown logic.

| Chunk | Module |
|---|---|
| C0 | `neverdownIdentity()` |
| **C2** | `src/x402/` — Hedera buyer (`payForRpcOnce`, `loadBuyerConfig`) |
| C3+ | policy, HCS, Arkiv, ENS, PoC, agent |

## C2 quick use

```bash
pnpm --filter @neverdown/core test
pnpm pay:once   # from repo root; needs .env spend keys + sellers running
```

Details: [docs/C2-PAY-ONCE.md](../../docs/C2-PAY-ONCE.md) · [docs/BUILD-CHUNKS.md](../../docs/BUILD-CHUNKS.md).
