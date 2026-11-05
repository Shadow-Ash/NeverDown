# Agents — read this first

You are working on **NeverDown** (ETHGlobal Mumbai). Full handoff: **[docs/AGENT-CONTEXT.md](docs/AGENT-CONTEXT.md)**.

## Product (non-negotiable)

- NeverDown is a **programmable resilience operator** for **any failure spot** (RPC, indexer, price API, …).
- **RPC is only the hackathon demo vertical** — not the product.
- Users encode playbooks in a **Resilience Contract** / policy; fast plane recovers; procurement discovers → verifies → pays → installs; evidence on Hedera HCS + HashScan.

## Do not

- Rebuild C0–C5.
- Reframe the whole app as “RPC payment product.”
- Start C9 UI before C6–C8 rails.
- Commit `.env` or print private keys.
- Edit `.cursor/plans/*` unless the human asks.

## Progress snapshot

| Done | Next |
|---|---|
| C0–C6 (C5 Arkiv live needs `ARKIV_*`; C6 ENS hermetic done) | **C7 Proof-of-Capability** → C8 agent → C9 UI → C10 pack |

## Where to look

| Need | Path |
|---|---|
| Chunk gates | [docs/BUILD-CHUNKS.md](docs/BUILD-CHUNKS.md) |
| Architecture | [docs/neverdown-architecture.md](docs/neverdown-architecture.md) |
| Buyer | `packages/core/src/x402/` · `pnpm pay:once` |
| Policy / HCS | `packages/core/src/policy/` · `packages/core/src/hcs/` |
| Arkiv | `packages/core/src/arkiv/` · `pnpm arkiv:seed` / `arkiv:query` |
| Gateway (RPC demo adapter) | `apps/gateway/` |
| Seller (RPC demo merchant) | `apps/sellers/` |

## Before coding

1. `git pull origin main`
2. Read [docs/AGENT-CONTEXT.md](docs/AGENT-CONTEXT.md) + the target chunk in BUILD-CHUNKS
3. Implement **one chunk**; pass its gate; commit with the message named in BUILD-CHUNKS
4. Push only if the human asks
