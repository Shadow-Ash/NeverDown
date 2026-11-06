# C8 — Supreme Agent

Wires C3–C7 into one **tool-only** loop for Act 3 (procure) and Act 4 (deny). Prints an evidence receipt JSON.

No fancy UI yet (C9). Default mode is **hermetic** (deterministic tools, no LLM required). `--live` uses Arkiv/ENS/PoC/gateway when env is set.

**C8 readiness vs C3 isolation:** [C3-SECURITY-GATE.md](./C3-SECURITY-GATE.md) — live `request_purchase` now uses the payment worker and installs only after confirmed settlement. A live testnet run and OS-enforced key isolation remain open.

## Tools

| Tool | Rails |
|---|---|
| `discover_offers` | C5 Arkiv |
| `resolve_seller` | C6 ENS |
| `proof_of_capability` | C7 |
| `request_purchase` | C3 worker validates the real offer challenge, applies policy, settles x402, and returns a scoped RPC credential |
| `install_standby` | C4 gateway `/_internal/install-standby` |
| `force_bad_purchase` | C3 deny demo |

## Run

```bash
pnpm agent:demo --scenario procure
pnpm agent:demo --scenario deny
# optional:
pnpm agent:demo --scenario procure --live
```

For live procurement, set `PAYMENT_WORKER_ENV_FILE` to a `0600` file containing the worker's Hedera spend credentials and policy configuration. Keep `HEDERA_SPEND_KEY` out of the parent `.env`. Seed v2 Arkiv offers with `probeurl`, `purchaseurl`, and `rpcurl`; configure `ENS_ALLOWLIST_NAMES`, `ENS_RPC_URL`, and the gateway internal API token. The seller and gateway must be running. Hermetic tests verify this flow without a Hedera transaction; live acceptance is still required before claiming the backend is complete.

## Code

`packages/core/src/agent/` · `scripts/agent-demo.ts`
