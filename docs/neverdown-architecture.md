# NeverDown architecture + chunk build

> Open the native diagram: [neverdown-architecture.excalidraw](./neverdown-architecture.excalidraw)  
> (excalidraw.com or the VS Code Excalidraw extension). Mermaid below is the same content.

---

## System architecture

```mermaid
flowchart TB
  dApp["Customer dApp"] --> GW["Gateway — Fast Recovery Plane\nhealth · standby · rollback"]
  GW -->|"health fail"| Mon["Health Monitors"]
  Mon --> Agent["Supreme Agent"]
  Agent --> Arkiv["Arkiv offers"]
  Agent --> ENS["ENSv2 identity"]
  Agent --> PoC["Proof-of-Capability"]
  Agent --> Policy["Policy Engine"]
  PoC --> Policy
  Policy -->|"approve / deny"| Hedera["Hedera x402 + HCS"]
  Hedera --> Seller["x402 RPC merchant"]
  Policy -->|"install standby"| GW
  Policy --> Evidence["Evidence Ledger"]
```

**Green path (data plane):** dApp → Gateway. Survives AI / Arkiv / Hedera outage.  
**Purple path (control plane):** Monitor → Agent → discover/verify/pay → replenish standby.

---

## Build in small chunks (do not build all at once)

```mermaid
flowchart LR
  C0[C0 scaffold] --> C1[C1 seller 402]
  C1 --> C2[C2 Hedera pay]
  C2 --> C3[C3 policy HCS]
  C3 --> C4[C4 gateway]
  C4 --> C5[C5 Arkiv]
  C5 --> C6[C6 ENS]
  C6 --> C7[C7 PoC]
  C7 --> C8[C8 agent]
  C8 --> C9[C9 UI]
  C9 --> C10[C10 judge pack]
```

| Chunk | Build only this | Gate before next |
|---|---|---|
| C0 | Monorepo empty shells + `.env.example` | `pnpm i` works |
| C1 | Seller returns HTTP 402 | `curl` shows 402 |
| C2 | Pay script settles on Hedera | HashScan tx id |
| C3 | Policy allow/deny + HCS | Over-cap refuses; PAY logged |
| C4 | Gateway failover | Kill primary → standby works |
| C5 | Arkiv seed + query | Live offer query |
| C6 | ENSv2 resolve | Off-allowlist fails closed |
| C7 | Proof-of-Capability | Bad RPC fails; good passes |
| C8 | Wire agent tools | Act 3 + Act 4 without UI |
| C9 | Console five-act | Clickable demo |
| C10 | README + arkiv md + video list | Ship checklist |

**Rule:** rails first (C1–C7) → agent (C8) → UI last (C9) → judge pack (C10).
