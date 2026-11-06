# NeverDown — full stack validation plan

Run every gate **twice**. Each check lists: command, two correct inputs/expectations, and what failure looks like.

**Do not commit `.env`.** Do not paste keys into chat.

Related: [C3-SECURITY-GATE.md](./C3-SECURITY-GATE.md) · [C5-ARKIV.md](./C5-ARKIV.md) · [C8-AGENT.md](./C8-AGENT.md)

---

## 0. Env shape (before live rails)

| Check | Correct inputs (examples) | If fails |
|---|---|---|
| Hedera ids | `HEDERA_SPEND_ID=0.0.…`, `HEDERA_MERCHANT_ACCOUNT_ID=0.0.…`, `HEDERA_TOPIC_ID=0.0.…` | Policy/pay/HCS refuse to load |
| Spend/operator keys | DER private keys from portal (not `0x` eth keys) | Sign / HCS publish fails |
| `POLICY_ALLOWLIST` | Bare ids only: `0.0.11326899` | `PolicyConfigError` — **not** `name:0.0.123` |
| Arkiv | `ARKIV_PRIVATE_KEY=0x`+64 hex, `ARKIV_ACCESS_KEY=ark_…` | Seed/query throw config errors |
| ENS | `ENS_RPC_URL=https://…sepolia…`, allowlist names | Live resolve throws; hermetic agent still OK |
| OpenAI / OpenRouter | `OPENAI_API_KEY=sk-…`, `OPENAI_BASE_URL=…` | Unused by hermetic C8; only matters if LLM wired |

Two correct allowlist pairs used in this repo:

1. Policy payTo: `0.0.11326899` (merchant)  
2. ENS names: `good.neverdown.eth`, `seller-a.neverdown.eth`, `seller-b.neverdown.eth`

---

## 1. Unit / package gates (no chain spend)

| # | Command | Correct outcome A | Correct outcome B | On failure |
|---|---|---|---|---|
| U1 | `pnpm test:core` | All core tests pass | Re-run → same pass count | Broken policy/worker/PoC/agent logic |
| U2 | `pnpm test:sellers` | All seller tests pass | Re-run identical | 402 / merchant regression |
| U3 | `pnpm test:gateway` | All gateway tests pass | Re-run identical | Failover / health regression |

---

## 2. Hermetic demos (safe, no live settle required)

| # | Command | Correct A | Correct B | On failure |
|---|---|---|---|---|
| H1 | `pnpm agent:demo --scenario procure` | `success: true`, tools: discover→ENS→PoC→purchase→install | Second run also `success: true` with new `purchaseId` | Step `ok:false` in receipt; exit 1 |
| H2 | `pnpm agent:demo --scenario deny` | `denyReason: RECIPIENT_NOT_ALLOWLISTED`, no settle | Second run same deny | If `approved: true` → allowlist/policy bug |

Two correct procure signals in receipt:

1. `poc.pass === true`  
2. `purchase.settled === true` (hermetic) + `standbyInstall` present  

Two correct deny signals:

1. `purchase.approved === false`  
2. `denyReason === "RECIPIENT_NOT_ALLOWLISTED"`

---

## 3. Policy / HCS

| # | Command | Correct A | Correct B | On failure |
|---|---|---|---|---|
| P1 | `pnpm policy:smoke` | Good purchase authorized | Duplicate id / bad recipient denied | Exit ≠ 0; misconfigured `POLICY_*` |
| P2 | `pnpm hcs:smoke` | Message publishes (needs operator + topic) | Second publish also ok or documented skip | Topic/key wrong → publish error |

---

## 4. Arkiv live (C5)

| # | Command | Correct A | Correct B | On failure |
|---|---|---|---|---|
| A1 | `pnpm arkiv:seed` | Seeds good-A + good-B (+ short-lived C) | Re-seed creates new entities (or succeeds again) | Bad key/access/funds → RPC/auth error |
| A2 | `pnpm arkiv:query` | ≥1 live offer with `entityKey` + `sellerens` | Second query still ≥1 (until expiry) | Empty → seed failed or all expired |

Two correct offer rows to expect after seed:

1. `seller-a.neverdown.eth` @ 10000 tinybars → `http://localhost:4001`  
2. `seller-b.neverdown.eth` @ 12000 tinybars → `http://localhost:4002`

---

## 5. PoC + pay (live-ish)

| # | Command | Correct A | Correct B | On failure |
|---|---|---|---|---|
| C7 | `pnpm poc:smoke` | Hermetic/good candidate passes checks | Bad candidate fails closed | Wrong reference RPC → false negatives |
| C2 | `pnpm pay:once` | Returns HashScan / tx id (spends HBAR) | Optional second pay if budget allows | 402/path/key/budget → no settle |

**Warning:** `pay:once` spends real testnet HBAR. Run deliberately.

---

## 6. Live agent (optional; C8 PARTIAL)

```bash
pnpm agent:demo --scenario procure --live
```

Expect: Arkiv discover works if seeded; ENS live resolve **fails** unless Sepolia names exist with text records; purchase authorizes in-process (does **not** use payment worker yet — see C3-SECURITY-GATE).

Two correct live preconditions:

1. Arkiv query returns allowlisted `sellerens`  
2. Those names resolve on Sepolia with matching `hederaAccount`

---

## 7. OpenAI / OpenRouter

Not on the hermetic C8 path. Optional ping:

```bash
# manual: POST {OPENAI_BASE_URL}/models or /chat/completions with Authorization Bearer
```

If key/base URL wrong → 401/404; agent demos still pass hermetic.

---

## Execution order (this session)

1. Fix `POLICY_ALLOWLIST` if prefixed  
2. U1–U3 twice  
3. H1–H2 twice  
4. P1 twice; P2 if operator/topic set  
5. A1 then A2 twice  
6. C7 twice; C2 only if intentionally spending  
7. Record results below  

### Results log (2026-11-06 session)

| Gate | Pass 1 | Pass 2 | Notes |
|---|---|---|---|
| U1 core | PASS 40/40 | PASS 40/40 | Fixed hermetic `POLICY_ENDPOINTS` + Windows worker spawn/mode |
| U2 sellers | PASS 22/22 | PASS 22/22 | |
| U3 gateway | PASS 16/16 | PASS 16/16 | |
| H1 procure | PASS | PASS | `success:true`, `good.neverdown.eth` |
| H2 deny | PASS | PASS | `RECIPIENT_NOT_ALLOWLISTED` |
| P1 policy | PASS | PASS | Fixed smoke duplicate id bug |
| P2 hcs | PASS seq 6 | PASS seq 7 | Topic `0.0.11328605` VERIFIED |
| A1 seed | PASS | — | good-A/B + expired-C on Rabdi |
| A2 query | PASS (1 live) | PASS (1 live) | `seller-a.neverdown.eth` @ 10000 |
| C7 poc | PASS | PASS | Live Alchemy + mock fail cases |
| C2 pay | SKIPPED | SKIPPED | Spends HBAR — run `pnpm pay:once` deliberately |
| OpenAI/OpenRouter | see session | | Models ping |
| ENS live names | N/A | | RPC up; names may be unregistered on Sepolia |
