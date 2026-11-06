# Live backend acceptance (RPC demo vertical)

NeverDown's RPC adapter is the first failure spot. The backend is ready for a live acceptance run only after the checks below pass. Hermetic tests and fake facilitator responses do not count as a Hedera settlement.

## Configure without exposing spend keys

1. Keep `HEDERA_SPEND_KEY`, `HEDERA_OPERATOR_KEY`, and `ARKIV_PRIVATE_KEY` out of the agent and coordinator `.env`. `startPaymentWorker` refuses a parent process that carries those keys.
2. Create `PAYMENT_WORKER_ENV_FILE` (default `.env.worker`) with mode `0600`. Give it the Hedera spend credentials, policy allowlist, price cap, approved seller base URL, persistent `POLICY_DB_PATH`, and HCS topic/operator values. Keep it outside Git.
3. Set `ENS_RPC_URL` and a nonempty `ENS_ALLOWLIST_NAMES`. The selected seller's `hederaAccount` must equal the offer's `payto`; its `x402Url` must equal the offer's `serviceurl`.
4. Set `POC_REFERENCE_RPC` to an independent RPC on the expected chain. The seller must use `RPC_MODE=upstream` and point at a working upstream for that chain.
5. Enable `GATEWAY_INTERNAL_API=true` and set a strong `GATEWAY_INTERNAL_TOKEN`. Configure primary and preapproved standby RPC URLs. Keep `INCIDENT_DB_PATH` and `POLICY_DB_PATH` persistent.
6. Seed v2 Arkiv offers. Each usable offer must advertise the same seller base URL with `/probe`, `/rpc-pack`, and `/rpc` paths and have an unexpired app and protocol lifetime. Reseed after the schema v2 upgrade; old entities are not read by the new query.

## Run

From the repository root, with the configured services running:

```bash
pnpm --filter @neverdown/sellers dev
pnpm --filter @neverdown/gateway dev
pnpm arkiv:query
pnpm agent:demo --scenario procure --live
pnpm coordinator:dev
pnpm --filter @neverdown/web dev
```

Use separate terminals for long-running services. `pnpm agent:demo --scenario procure --live` should settle one capped testnet purchase, install a standby only after receiving a valid pack credential, and print a redacted receipt with a transaction ID and HashScan URL. `pnpm coordinator:dev` then watches future gateway failovers and starts one procurement job per incident.

## Acceptance evidence

- A primary outage switches the gateway to a healthy preapproved standby before procurement starts. RPC reads continue while the coordinator is stopped.
- Arkiv query returns a v2 offer; ENS resolution and the independent PoC pass. A bad recipient or over-budget challenge signs nothing.
- The worker returns `SETTLED`, the HashScan transaction exists, and HCS authorization and settlement records are independently visible. The seller issues a bounded token; the gateway serves repeated authenticated RPC reads without paying for each request.
- `GET /api/incidents` and `GET /api/incidents/{incidentId}` show the persisted, redacted outcome. Restarting the coordinator does not start a duplicate purchase. `UNCERTAIN` outcomes require manual reconciliation.
- A failed candidate install leaves the last healthy standby route unchanged.

## Current limits

The C3 security gate remains **PARTIAL**: worker secrets and SQLite files are readable by processes under the same OS user. The public probe limit is per seller process. Merchant entitlements are bounded by time and request count, and require persistent SQLite. An incident interrupted after claiming remains `STARTED` until manually reconciled. The live testnet transaction and its evidence IDs must be recorded after a configured run; do not infer them from hermetic tests.
