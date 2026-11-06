# ENS setup for live NeverDown

Live preflight resolves the seller on **Ethereum mainnet** ENS (`ENS_RPC_URL` → chain id `0x1`).

## Required name

Default demo identity: **`neverdown.eth`** (already has a mainnet resolver).

Owner address observed on mainnet: `0x4Df6e0f9Ed361C116bB3D480Ea26700E531c40C8`.

## Required text records

| Key | Value |
|---|---|
| `hederaAccount` | Merchant Hedera account, e.g. `0.0.11326899` |
| `x402Url` | Seller base URL, e.g. `http://localhost:4001` (demo) or public HTTPS URL |
| `category` | `rpc` (optional) |

Set via [app.ens.domains](https://app.ens.domains) → name → records, or:

```bash
# Requires ENS_OWNER_PRIVATE_KEY for the name controller/owner (never commit it)
pnpm ens:set-texts
```

Then:

```bash
pnpm ens:check
```

## Local rehearsal overlay (not for judge evidence)

If the owner key is unavailable during local rehearsal, `.env.agent` may set:

```env
ENS_ALLOW_TEXT_OVERLAY=true
ENS_TEXT_hederaAccount=0.0.11326899
ENS_TEXT_x402Url=http://localhost:4001
```

This still resolves `neverdown.eth` on mainnet, then fills **missing** texts from env.  
**Turn overlay off** and publish real on-chain texts before recording submission HashScan / ENS prize evidence.
