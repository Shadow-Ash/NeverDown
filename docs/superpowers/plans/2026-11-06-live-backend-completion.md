# Live Backend Completion Implementation Plan

> **For agentic workers:** Implement one task at a time with tests first. Keep the existing fast recovery plane independent of the procurement plane.

**Goal:** Complete one real RPC incident from fast failover through verified replacement procurement, Hedera settlement, standby installation, and auditable evidence.

**Architecture:** The gateway continues serving a preapproved standby without waiting for an agent. A separate coordinator observes failover events and starts the procurement flow once per incident. The agent selects and verifies an offer; a secret-owning payment worker validates the seller's real x402 challenge, settles it, and delivers a scoped entitlement to the authenticated gateway. A persisted receipt links the incident, offer, ENS result, proof, settlement, installation, and HCS events.

**Tech stack:** Existing pnpm/TypeScript workspace, Express gateway and seller, Arkiv SDK, ethers ENS, Hedera x402, HCS, SQLite budget store, Node test runner.

**Scope:** Finish the live RPC vertical first. Reuse the same policy, purchase, and evidence contracts for later indexer and price API adapters. Do not claim production-grade key isolation or support for every dependency type at this gate.

---

## Current blockers to address

- `packages/core/src/agent/tools.ts` authorizes a fabricated challenge in-process and returns `settled: false`.
- `packages/core/src/poc/proofOfCapability.ts` probes unpaid JSON-RPC methods, while `apps/sellers/src/app.ts` protects `/rpc` with x402; the seller only accepts three read methods and does not support PoC's `eth_getBlockByNumber` call.
- One x402 payment currently buys one RPC request. `apps/gateway/src/gateway.ts` installs only a URL and forwards future requests without an entitlement, so the purchased endpoint cannot yet serve as a usable standby.
- `apps/gateway/src/gateway.ts` records failover events in memory, but nothing triggers a persistent procurement job.
- `apps/web/src/server.ts` runs the hermetic agent by default and does not expose a persisted, linked evidence record.

## Task 1: Define a usable capability contract

**Files:** `packages/core/src/arkiv/schema.ts`, `packages/core/src/arkiv/seed.ts`, `packages/core/src/arkiv/discover.ts`, `packages/core/src/agent/types.ts`, `apps/sellers/src/app.ts`, `apps/sellers/src/rpc.ts`, related tests and Arkiv schema docs.

- [ ] Specify separate `probeUrl`, `purchaseUrl`, and `rpcUrl` for each RPC offer, plus seller ENS name, payTo, chain ID, price, expiry, and entity key. Read and write the same versioned shape on Arkiv; exclude expired or incomplete offers.
- [ ] Provide a bounded unpaid probe that supports the PoC checks, including `eth_chainId`, `eth_blockNumber`, and `eth_getBlockByNumber`; keep normal RPC access protected.
- [ ] Make the paid resource sell a bounded RPC entitlement rather than a single JSON-RPC response. Define its expiry, request allowance, and scoped credential format; the seller must reject expired, exhausted, or absent credentials.
- [ ] Ensure the gateway can use the entitlement for repeated standby requests without paying on each request. Preserve the current `pay:once` demonstration while migrating the live agent to the pack purchase endpoint.
- [ ] Add seller and PoC tests for a successful probe, bad chain/stale block, unpaid access denial, and repeated access with a valid purchased entitlement.

**Gate:** A candidate can be probed before purchase; after one settlement, the gateway can make multiple authorized RPC reads until the entitlement limit is reached.

## Task 2: Bind payment to the selected offer

**Files:** `packages/core/src/payment-worker/protocol.ts`, `client.ts`, `worker.ts`, `purchase.ts`, `packages/core/src/policy/types.ts`, `packages/core/test/paymentWorkerIpc.test.ts`, `packages/core/test/security.test.ts`.

- [ ] Extend the worker request with nonsecret expected terms: selected offer/entity key, purchase endpoint, expected payTo, exact price, and service ID. Keep private keys and arbitrary payment requirements out of IPC.
- [ ] In the worker, fetch the seller's actual HTTP 402 challenge and reject it if endpoint, network, asset, payTo, amount, or resource differs from the selected offer and policy. Retain budget reservation, replay protection, HCS authorization, and fail-closed behavior.
- [ ] Settle only through `startPaymentWorker`; return a typed outcome that distinguishes `SETTLED`, `DENIED`, `RELEASED`, and `UNCERTAIN`. Never treat an uncertain result as permission to purchase again automatically.
- [ ] Keep the spend key in `PAYMENT_WORKER_ENV_FILE` with mode `0600`; use a persistent `POLICY_DB_PATH`. Do not expose keys or the gateway entitlement in public receipts or logs.
- [ ] Test matching terms settle once; changed amount/payTo/endpoint denies before signing; duplicate purchase ID denies; worker timeout is `UNCERTAIN`; HCS authorization failure prevents signing when durable audit is required.

**Gate:** A real seller challenge settles once on Hedera testnet and returns a transaction ID; a mismatched challenge produces no transaction.

## Task 3: Finish live agent procurement and installation

**Files:** `packages/core/src/agent/tools.ts`, `run.ts`, `types.ts`, `packages/core/src/ens/resolve.ts`, `packages/core/src/poc/proofOfCapability.ts`, `apps/gateway/src/app.ts`, `gateway.ts`, related tests.

- [ ] Require a nonempty ENS allowlist in live mode; compare the ENS payTo and purchase endpoint with the Arkiv offer. Check offer expiry and chain ID before PoC.
- [ ] Run PoC against `probeUrl`, then request purchase from the worker for the selected offer. Require `SETTLED` before installation; map every other outcome to an evidence-backed stop.
- [ ] Transfer the scoped entitlement only through a trusted installation path. Store it on the gateway side, send it on standby RPC requests, and omit it from `/status`, events, receipts, and error messages.
- [ ] Probe the newly installed standby through the gateway before reporting success. If verification fails, keep the last known good route and record installation failure.
- [ ] Test no installation after bad ENS, failed PoC, denied payment, or uncertain payment; test settled purchase followed by verified standby installation.

**Gate:** `pnpm agent:demo --scenario procure --live` produces a settled transaction and a healthy, usable standby without a human approving the purchase.

## Task 4: Trigger procurement from incidents

**Files:** `apps/gateway/src/gateway.ts`, `apps/gateway/src/app.ts`, a new coordinator under `packages/core/src/agent/` or `apps/`, its persistent incident ledger, and tests.

- [ ] Give each gateway process a stable runtime ID and each failover event an unambiguous key; expose events to a separate coordinator without blocking health checks or JSON-RPC forwarding.
- [ ] Persist coordinator state by incident key. Start at most one procurement attempt per qualifying failover; apply cooldown and bounded retries to transient discovery failures.
- [ ] Never retry `UNCERTAIN` payment automatically. On coordinator restart, reconcile the stored purchase state before deciding whether work can continue.
- [ ] Keep manual procure and deny controls for the demo, but make automatic procurement independently testable with the agent and payment rails offline.
- [ ] Test duplicate events, gateway restart, coordinator restart, provider flapping, worker outage, and failover latency with procurement disabled.

**Gate:** Killing the primary switches traffic to a preapproved standby immediately and starts one background replenishment job. The gateway continues serving if Arkiv, ENS, Hedera, or the agent is unavailable.

## Task 5: Persist and expose evidence

**Files:** `packages/core/src/agent/types.ts`, coordinator receipt storage, `packages/core/src/hcs/`, `apps/web/src/server.ts`, `apps/web/public/index.html`, tests.

- [ ] Persist a receipt keyed by incident and purchase ID with Arkiv entity, ENS name and records checked, PoC result, policy version, worker outcome, HashScan URL, gateway verification, and HCS outbox status.
- [ ] Expose read-only status and receipt endpoints. Authenticate any endpoint that starts a live purchase or injects an outage; keep hermetic demo actions explicitly labeled.
- [ ] Render missing, pending, denied, uncertain, and settled states honestly. Do not display a PAY proof until settlement is confirmed or claim HCS publication when it failed.
- [ ] Test receipt redaction, link formation, restart persistence, and UI API responses for each outcome.

**Gate:** An operator can trace one incident from failure through settlement and installation, or through a documented denial, using independently checkable IDs and links.

## Task 6: Live acceptance and release gate

**Files:** `.env.example`, `docs/C3-SECURITY-GATE.md`, `docs/C8-AGENT.md`, `docs/BUILD-CHUNKS.md`, `README.md`, live smoke scripts and tests.

- [ ] Run `pnpm --filter @neverdown/core test`, `pnpm --filter @neverdown/sellers test`, `pnpm --filter @neverdown/gateway test`, `pnpm -r run typecheck`, and `pnpm -r run build` after the targeted tests for each task.
- [ ] Seed and query a live Arkiv offer; resolve its ENS records on the configured network; record the entity key and name in the runbook.
- [ ] Run one capped Hedera testnet purchase through the worker and confirm the HashScan transaction plus HCS authorization and settlement events.
- [ ] Inject a primary failure; confirm failover serves RPC while the coordinator procures and installs a new standby. Then run a bad-recipient and an over-budget case; confirm neither signs.
- [ ] Stop the control plane and confirm the gateway continues serving its last known good route. Restart the coordinator and confirm no duplicate purchase.
- [ ] Document actual commands, configuration, evidence IDs, known limits, and the remaining same-OS-user secret isolation gap. Do not mark the C3 security gate FULL without OS-enforced separation and stronger IPC coverage.

**Release gate:** The live RPC path passes all checks above on a clean configured machine. Only then describe this vertical as end-to-end working. General failure-spot adapters and production security remain separate follow-on work.
