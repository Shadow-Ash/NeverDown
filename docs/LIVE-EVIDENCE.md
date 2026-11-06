# Live acceptance evidence (2026-11-06)

Recorded from a configured local run. Secrets are not included.

| Item | Value |
|---|---|
| ENS seller | `neverdown.eth` (mainnet resolve; text overlay used for local rehearsal — publish on-chain texts for prize evidence) |
| Arkiv v2 entityKey | `0x74867aaf0276debc7b151f1a40e6c1cd4e06d14018539f01112a17738a63310d` |
| Arkiv seed tx | `0x13c652af10fa128c705ce0ac6be798a9c6960548d728decabb705c9987d9d2ac` |
| Hedera settle tx | `0.0.9185802@1793985063.486076384` |
| HashScan | https://hashscan.io/testnet/transaction/0.0.9185802%401793985063.486076384 |
| Purchase audit | `published` |
| Deny demo | `RECIPIENT_NOT_ALLOWLISTED` for `0.0.99999999` (no settle) |
| Gateway after install | standby installed; `/ready` true; active primary |

## Commands that passed

```bash
pnpm ens:check
pnpm arkiv:seed && pnpm arkiv:query
pnpm seller:live   # separate process
pnpm gateway:live  # separate process
pnpm preflight:live
pnpm agent:live
pnpm agent:deny-live
```
