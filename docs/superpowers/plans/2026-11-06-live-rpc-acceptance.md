# Live RPC Acceptance Implementation Plan

> **For agentic workers:** Implement this plan task by task. Read `AGENTS.md`, `docs/AGENT-CONTEXT.md`, `docs/C3-SECURITY-GATE.md`, and `docs/LIVE-BACKEND-ACCEPTANCE.md` first. Keep the user's `apps/web/public/index.html` change out of commits unless the user requests it.

**Goal:** Prove one real RPC failure, fast failover, verified replacement purchase, installation, and auditable evidence on the configured testnets.

**Architecture:** The existing gateway performs recovery without waiting for procurement. The coordinator observes incidents, while the agent checks Arkiv, ENS, and capability before asking a separate worker to pay. A settlement credential is installed into the gateway only after a confirmed transaction. This plan closes configuration and live verification gaps; it does not introduce another recovery engine.

**Tech stack:** TypeScript, Node, pnpm workspace, Arkiv Rabdi, Ethereum ENS, Hedera testnet x402 and HCS, SQLite.

**Scope:** One RPC seller and one verified offer. RPC remains the demo vertical of a programmable resilience operator for any failure spot. Do not claim indexer or price API support at this gate.

---

## Starting evidence

- Local tests passed at the last check: core 60, seller 29, gateway 19, web 1; core/web typechecks passed.
- `scripts/query-arkiv.ts` returned no live v2 offers. `packages/core/src/arkiv/seed.ts` uses hardcoded ENS names and localhost URLs.
- The installed `ethers` version is 6.16.0; ENS documentation specifies 6.17.0 or later for ENSv2-ready reads.
- The configured ENS seller lookup failed. No working seller name and records have been supplied yet.
- The root `.env` contains signing keys; the live parent process must not receive them. `.env.worker`, `PAYMENT_WORKER_ENV_FILE`, `POC_REFERENCE_RPC`, `GATEWAY_INTERNAL_API`, and `GATEWAY_INTERNAL_TOKEN` were absent or empty at the last check.
- The configured x402 facilitator's `/supported` endpoint returned HTTP 200 and advertised `hedera:testnet` `exact` at the last read-only check. This does not prove settlement.

## Task 1: Verify seller identity before writing offers

**Files:** `packages/core/src/ens/resolve.ts`, `packages/core/package.json`, `packages/core/test/ens.test.ts`, new `scripts/check-ens.ts` (read-only), `docs/LIVE-BACKEND-ACCEPTANCE.md`.

- [ ] Obtain one ENS name controlled by the seller. On Ethereum mainnet, set `hederaAccount` to the Hedera merchant account and `x402Url` to the seller's exact base URL; ensure the resolver is configured. Do not put keys in the repository. This is an external prerequisite, not a code test.
- [ ] Add an ENS regression test that reads a v2-compatible resolver through the chosen library and fails for missing/mismatched text records.
- [ ] Upgrade `ethers` to at least 6.17.0 or switch the read path to the existing ENSv2-ready `viem` dependency; keep the fail-closed allowlist and payTo checks.
- [ ] Run the focused ENS test, core typecheck, and a read-only lookup of the real name using `ENS_RPC_URL`. Confirm the name, `hederaAccount`, and `x402Url` match the intended seller. Do not log credentials.
- [ ] Commit the code/test/documentation changes. Do not commit a paid transaction or secret configuration.

**Gate:** Real ENS lookup succeeds with the exact merchant account and seller URL. A changed account or URL fails before any PoC or purchase.

## Task 2: Publish one matching, unexpired Arkiv offer

**Files:** `packages/core/src/arkiv/seed.ts`, `scripts/seed-arkiv.ts`, `packages/core/test/arkiv.test.ts`, `docs/C5-ARKIV.md`.

- [ ] Replace the hardcoded `seller-a.neverdown.eth`/`localhost:4001` production seed with validated inputs for the chosen ENS name, seller base URL, merchant account, price, chain ID, and app expiry. Keep the existing example/negative offers only in tests.
- [ ] Validate that the generated `serviceurl`, `probeurl`, `purchaseurl`, and `rpcurl` share the same origin and the required `/probe`, `/rpc-pack`, `/rpc` paths. Reject invalid price, chain, or past expiry before writing.
- [ ] Test valid and invalid seed inputs without Arkiv writes. Run seller and core tests.
- [ ] With a funded Rabdi wallet and access key, seed one v2 offer. Run `node --env-file-if-exists=.env --import tsx scripts/query-arkiv.ts` and verify exactly the intended offer survives category, price, version, and expiry filtering. Record its entity key and expiry in the private run log.
- [ ] Commit code and docs; never commit `ARKIV_PRIVATE_KEY`.

**Gate:** The live query returns a v2 offer whose fields match the resolved ENS records and the running seller. Arkiv's protocol expiry and the offer's `expiresat` both remain valid for the demo window.

## Task 3: Split and validate runtime configuration

**Files:** `.env.example`, new `packages/core/src/agent/preflight.ts`, new `packages/core/test/preflight.test.ts`, new `scripts/live-preflight.ts`, `docs/LIVE-BACKEND-ACCEPTANCE.md`; local untracked `.env` and `.env.worker` only for runtime values.

- [ ] Prepare separate environments for seller, gateway, coordinator/agent, and payment worker. The agent/coordinator environment must not contain `HEDERA_SPEND_KEY`, `HEDERA_OPERATOR_KEY`, `ARKIV_PRIVATE_KEY`, or `RECLAIM_PRIVATE_KEY`; the worker file is mode `0600` and holds only the secrets and policy settings it needs. Use persistent, private SQLite paths.
- [ ] Set the same approved seller base URL and merchant account in the worker policy, ENS records, Arkiv offer, and seller. Set per-payment cap and total budget for one small testnet purchase, plus the required HCS topic/operator settings.
- [ ] Set `POC_REFERENCE_RPC` to an independent Sepolia RPC, `GATEWAY_INTERNAL_API=true`, and a strong `GATEWAY_INTERNAL_TOKEN`. Use distinct primary and standby RPC providers. Confirm the candidate seller runs in upstream mode on Sepolia.
- [ ] Add a redacted preflight check that reports missing values, wrong permissions, stale services, mismatched price/payTo/URL, and facilitator capability without printing values or signing. Test the failure cases first.
- [ ] Run the preflight and all relevant typechecks; commit only code, tests, `.env.example`, and documentation.

**Gate:** Preflight passes with zero signing keys in the parent; worker startup succeeds; seller, gateway, and reference RPC respond after restarting services with the new code.

## Task 4: Prove one controlled purchase and installation

**Files:** `scripts/agent-demo.ts`, `packages/core/src/agent/run.ts`, `packages/core/src/payment-worker/purchase.ts`, `apps/gateway/src/app.ts`, related tests only if the live run reveals a defect; `docs/LIVE-BACKEND-ACCEPTANCE.md` for sanitized evidence.

- [ ] Before paying, verify seller `/probe`, unpaid `/rpc-pack` 402, selected challenge terms, ENS records, Arkiv offer, and independent PoC. Check facilitator `/supported` for Hedera testnet exact and the expected fee payer.
- [ ] Run one capped `agent:demo --scenario procure --live` purchase. Do not automatically retry an `UNCERTAIN` result. Inspect the worker ledger and chain first.
- [ ] Confirm `SETTLED`, transaction ID, HashScan result, HCS authorization and settlement messages, and bounded seller credential. Confirm gateway installation only after settlement and repeated RPC reads through that credential. Confirm receipt and API do not expose the credential.
- [ ] If any step fails, fix the narrow cause, add a regression test, rerun the relevant suite, and rerun only safe/idempotent checks. Do not spend again until payment state is reconciled.
- [ ] Commit any fixes and sanitized runbook notes. Keep raw secrets and credentials out of logs, docs, and commits.

**Gate:** One independently verifiable testnet settlement purchases a usable standby, and the gateway serves repeated authenticated reads without a second payment.

## Task 5: Prove incident automation and failure safety

**Files:** `packages/core/src/agent/coordinator.ts`, `apps/gateway/src/gateway.ts`, `apps/web/src/server.ts`, focused tests if defects appear, `docs/LIVE-BACKEND-ACCEPTANCE.md`.

- [ ] Start the coordinator with persistent `INCIDENT_DB_PATH`; inject one primary failure using the existing authenticated demo control. Measure that the gateway switches to its preapproved standby before procurement finishes.
- [ ] Confirm one coordinator claim and one replacement attempt for the incident. Restart the coordinator and verify no duplicate paid purchase. Stop the coordinator and verify the gateway keeps serving.
- [ ] Check `GET /api/incidents` and `GET /api/incidents/{incidentId}` for the linked redacted receipt. Verify denial tests for wrong recipient and over-budget terms produce no Hedera transaction. A failed candidate install must keep the last healthy route.
- [ ] Document actual evidence IDs, observed timings, and failures. Add regression tests for any uncovered defect; rerun core, seller, gateway, web, typechecks, and build.

**Gate:** A single live incident demonstrates fast recovery, one background replenishment, no duplicate spend after restart, and independently checkable evidence.

## Verification commands

Use separate terminals for long-running services. These commands are run from the repository root after the required external configuration is ready:

```bash
node --env-file-if-exists=.env --import tsx scripts/check-ens.ts
node --env-file-if-exists=.env --import tsx scripts/query-arkiv.ts
node --env-file-if-exists=.env --import tsx scripts/live-preflight.ts
node --env-file-if-exists=.env --import tsx scripts/agent-demo.ts --scenario procure --live
node --import tsx --test 'packages/core/test/**/*.test.ts'
node --import tsx --test 'apps/sellers/test/**/*.test.ts'
node --import tsx --test 'apps/gateway/test/**/*.test.ts'
node --import tsx --test 'apps/web/test/**/*.test.ts'
```

The ENS check and preflight scripts are created by Tasks 1 and 3. Do not run the paid `agent-demo --live` command until the first three checks pass and the seller and gateway are running with the intended configuration.

## Release rule

Describe the RPC demo backend as **end-to-end working** only after Tasks 1–5 pass on a clean configured run and the evidence IDs are recorded. Keep `docs/C3-SECURITY-GATE.md` at **PARTIAL** until OS-level secret isolation and stronger IPC coverage are actually implemented. Do not present RPC support as support for every failure spot.
