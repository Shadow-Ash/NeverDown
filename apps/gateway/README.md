# `@neverdown/gateway`

**Fast Recovery Plane** — deterministic RPC proxy.

| Chunk | Role |
|---|---|
| **C0** | Scaffold only (current) |
| **C4** | Health checks, primary→standby failover, rollback, inject-outage |

Must keep serving if the AI / Arkiv / Hedera control plane is down.

Full steps and gate: [docs/BUILD-CHUNKS.md](../../docs/BUILD-CHUNKS.md#c4--gateway-fast-recovery-plane).
