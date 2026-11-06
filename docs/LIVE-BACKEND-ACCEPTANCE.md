# Live backend acceptance (RPC demo vertical)

NeverDown's RPC adapter is the first failure spot. The backend is ready for a live acceptance run only after the checks below pass. Hermetic tests and fake facilitator responses do not count as a Hedera settlement.

## Configure without exposing spend keys

1. Copy `.env.agent.example` to an ignored `.env.agent` and fill in nonsecret settings. Copy `.env.seller.example` to `.env.seller` for the seller. Keep `HEDERA_SPEND_KEY`, `HEDERA_OPERATOR_KEY`, and `ARKIV_PRIVATE_KEY` out of both; `startPaymentWorker` refuses a parent process that carries those keys. Keep the Arkiv writer key in a separate local environment used only for seeding.
2. Copy `.env.worker.example` to the ignored `PAYMENT_WORKER_ENV_FILE` (default `.env.worker`) and set mode `0600`. Give it the Hedera spend credentials, policy allowlist, price cap, approved seller base URL, persistent `POLICY_DB_PATH`, and HCS topic/operator values. Keep it outside Git.
3. Set `ENS_RPC_URL` to an Ethereum mainnet RPC, `SELLER_ENS_NAME`, and a nonempty `ENS_ALLOWLIST_NAMES`. The selected seller's `hederaAccount` must equal the offer's `payto`; its `x402Url` must equal the offer's `serviceurl`. Read-only `pnpm ens:check` must pass before seeding.
4. Set `POC_REFERENCE_RPC` to an independent RPC on the expected chain. The seller must use `RPC_MODE=upstream` and point at a working upstream for that chain.
5. Enable `GATEWAY_INTERNAL_API=true` and set a strong `GATEWAY_INTERNAL_TOKEN`. Configure primary and preapproved standby RPC URLs. Keep `INCIDENT_DB_PATH` and `POLICY_DB_PATH` persistent.
6. Seed one v2 Arkiv offer using the real seller identity, URL, price, and chain ID. It must advertise `/probe`, `/rpc-pack`, and `/rpc` paths and have an unexpired app and protocol lifetime. Reseed after the schema v2 upgrade; old entities are not read by the new query.

The `pnpm preflight:live` command uses `.env.agent` and checks local configuration, the matching Arkiv offer, ENS records, independent PoC, seller 402 terms, and gateway status without signing or paying. Run it before `agent:demo --live`. A failed preflight is a stop, not permission to relax policy.

## Run

From the repository root, with the configured services running:

```bash
pnpm seller:live
pnpm gateway:live
pnpm arkiv:query
pnpm ens:check
pnpm preflight:live
pnpm agent:live
pnpm coordinator:live
pnpm --filter @neverdown/web dev
```

Use separate terminals for long-running services. Start the agent and coordinator with `.env.agent` through `agent:live` and `coordinator:live`; the older demo scripts load `.env`, which may contain signing keys and will be refused by the payment worker. The live agent command should settle one capped testnet purchase, install a standby only after receiving a valid pack credential, and print a redacted receipt with a transaction ID and HashScan URL. The coordinator then watches future gateway failovers and starts one procurement job per incident.

## Acceptance evidence

- A primary outage switches the gateway to a healthy preapproved standby before procurement starts. RPC reads continue while the coordinator is stopped.
- Arkiv query returns a v2 offer; ENS resolution and the independent PoC pass. A bad recipient or over-budget challenge signs nothing.
- The worker returns `SETTLED`, the HashScan transaction exists, and HCS authorization and settlement records are independently visible. The seller issues a bounded token; the gateway serves repeated authenticated RPC reads without paying for each request.
- `GET /api/incidents` and `GET /api/incidents/{incidentId}` show the persisted, redacted outcome. Restarting the coordinator does not start a duplicate purchase. `UNCERTAIN` outcomes require manual reconciliation.
- A failed candidate install leaves the last healthy standby route unchanged.

## Current limits

The C3 security gate remains **PARTIAL**: worker secrets and SQLite files are readable by processes under the same OS user. The public probe limit is per seller process. Merchant entitlements are bounded by time and request count, and require persistent SQLite. An incident interrupted after claiming remains `STARTED` until manually reconciled. The live testnet transaction and its evidence IDs must be recorded after a configured run; do not infer them from hermetic tests.

## Current local acceptance state (2026-11-06)

Ignored `.env.agent`, `.env.seller`, and `.env.worker` profiles have been prepared with file mode `0600`. A separate gateway instance reached `/ready` with two Sepolia providers and served `eth_chainId = 0xaa36a7`; a separate seller instance served the same chain ID through `/probe`. The agent preflight still stops because `SELLER_ENS_NAME` is unset. The ENS name in the prior allowlist has a resolver on Ethereum mainnet but lacks both `hederaAccount` and `x402Url` records. Arkiv query returned no live v2 offer. No new Hedera transaction or HCS acceptance evidence was produced by this work. Public RPC URLs used for the local smoke are development dependencies and should be replaced with controlled providers for a production deployment.
