# C3 — PolicyEngine + HCS audit

Every NeverDown spend is gated by **PolicyEngine** before x402 signing. Decisions are written to a Hedera **HCS** topic as `PAY` or `DENY`.

## Prerequisites

1. C1 sellers running (`pnpm --filter @neverdown/sellers dev`).
2. C2 spend wallet funded (`HEDERA_SPEND_ID` / `HEDERA_SPEND_KEY`).
3. Operator for topic create + message submit:
   - `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY`
   - Hackathon: reuse the spend account (same id/key).
4. Create a topic once:

```bash
pnpm hcs:create-topic
# → paste HEDERA_TOPIC_ID=0.0.N into .env
```

5. Policy env:

```env
POLICY_CAP_TINYBARS=50000
POLICY_ALLOWLIST=neverdown-rpc:0.0.YOUR_MERCHANT_ACCOUNT
POLICY_VERSION=c3-v1
```

`POLICY_ALLOWLIST` is comma-separated `sellerId:payTo` pairs. `payTo` must match the seller merchant account.

## Run smoke

```bash
# Terminal A
pnpm --filter @neverdown/sellers dev

# Terminal B
pnpm policy:smoke
```

Expect:

- `DENY OFF_ALLOWLIST`, `PAYTO_MISMATCH`, `OVER_CAP` (no x402 settle on those)
- one live `PAY` with HashScan settle URL
- Mirror topic messages listing PAY/DENY

Mirror: `https://testnet.mirrornode.hedera.com/api/v1/topics/{HEDERA_TOPIC_ID}/messages`  
HashScan topic: `https://hashscan.io/testnet/topic/{HEDERA_TOPIC_ID}`

## Code map

| Path | Role |
|---|---|
| `packages/core/src/policy/` | Config + `PolicyEngine.authorizePurchase` |
| `packages/core/src/hcs/` | Topic create/submit + Mirror decode |
| `scripts/create-hcs-topic.ts` | One-shot topic create |
| `scripts/policy-smoke.ts` | Live gate |

## Security note

Spend private key is used only on the **approve → pay** path inside PolicyEngine. Deny reasons never call x402. Keys are never logged.
