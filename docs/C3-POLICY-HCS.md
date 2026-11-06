# C3 — PolicyEngine + HCS audit

Server-side **authorize-before-sign** policy with durable budget reservations and Hedera **HCS** audit events.

**Security gate / known gaps:** [C3-SECURITY-GATE.md](./C3-SECURITY-GATE.md) (BigInt hash fix, payment worker IPC, PARTIAL isolation).

## Commands

```bash
pnpm --filter @neverdown/core test   # includes policy.test.ts
pnpm policy:smoke                    # authorize / deny / duplicate-id smoke
pnpm hcs:smoke                       # optional live HCS publish (needs operator + topic)
```

## Env (see `.env.example`)

| Var | Meaning |
|---|---|
| `POLICY_ALLOWLIST` | Comma-separated merchant account ids (`payTo`) |
| `POLICY_CAP_TINYBARS` / `POLICY_TOTAL_BUDGET_TINYBARS` | Budget |
| `POLICY_SERVICES` | Allowed service ids (default `neverdown-rpc-pack`) |
| `HEDERA_OPERATOR_*` + `HEDERA_TOPIC_ID` | HCS publish |
| `HCS_AUDIT_AVAILABILITY` | `REQUIRED_DURABLE` or `BEST_EFFORT` |

## Code map

| Path | Role |
|---|---|
| `packages/core/src/policy/` | `authorizePurchase`, `BudgetStore`, `securePurchase` |
| `packages/core/src/hcs/` | `HederaHcsClient`, evidence hashing, config |
| `scripts/policy-smoke.ts` | Authorization smoke |
| `scripts/hcs-smoke.ts` | Live topic publish smoke |

Deny paths never call x402 settle. Keys are never logged.
