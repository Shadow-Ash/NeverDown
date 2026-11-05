# C8 — Supreme Agent

Wires C3–C7 into one **tool-only** loop for Act 3 (procure) and Act 4 (deny). Prints an evidence receipt JSON.

No fancy UI yet (C9). Default mode is **hermetic** (deterministic tools, no LLM required). `--live` uses Arkiv/ENS/PoC/gateway when env is set.

## Tools

| Tool | Rails |
|---|---|
| `discover_offers` | C5 Arkiv |
| `resolve_seller` | C6 ENS |
| `proof_of_capability` | C7 |
| `request_purchase` | C3 policy (+ optional live settle later) |
| `install_standby` | C4 gateway `/_internal/install-standby` |
| `force_bad_purchase` | C3 deny demo |

## Run

```bash
pnpm agent:demo --scenario procure
pnpm agent:demo --scenario deny
# optional:
pnpm agent:demo --scenario procure --live
```

## Code

`packages/core/src/agent/` · `scripts/agent-demo.ts`
