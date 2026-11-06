import { discoverOffers } from "../arkiv/discover.js";
import type { CapabilityOfferRow } from "../arkiv/schema.js";
import { resolveAndValidateEnsSeller, type EnsSellerResolution } from "../ens/resolve.js";
import { openBudgetStore } from "../policy/budgetStore.js";
import { authorizePurchase } from "../policy/engine.js";
import { loadPolicyConfig } from "../policy/config.js";
import { proofOfCapability } from "../poc/proofOfCapability.js";
import type { PaymentRequired } from "@x402/core/types";
import type { AgentToolBelt } from "./types.js";

function challengeFor(payTo: string, amountTinybars: string, network = "hedera:testnet", asset = "0.0.0"): PaymentRequired {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: "http://localhost:4001/rpc", description: "agent", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network,
        amount: amountTinybars,
        asset,
        payTo,
        maxTimeoutSeconds: 60,
      },
    ],
  } as PaymentRequired;
}

/** Hermetic toolbelt — no chain / no LLM; for CI and `agent-demo --hermetic`. */
export function createHermeticToolBelt(opts?: {
  offers?: CapabilityOfferRow[];
  ensByName?: Record<string, EnsSellerResolution>;
  gatewayStandby?: { url: string }[];
}): AgentToolBelt {
  const offers =
    opts?.offers ??
    ([
      {
        entityKey: "0xgood",
        sellerens: "good.neverdown.eth",
        serviceurl: "http://candidate-rpc.local",
        schemaversion: 2n,
        probeurl: "http://candidate-rpc.local/probe",
        purchaseurl: "http://candidate-rpc.local/rpc-pack",
        rpcurl: "http://candidate-rpc.local/rpc",
        pricetinybars: 10000n,
        chainid: 11155111n,
        category: "rpc",
        payto: "0.0.11326899",
        expiresat: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        entityKey: "0xexpensive",
        sellerens: "pricey.neverdown.eth",
        serviceurl: "http://expensive-rpc.local",
        schemaversion: 2n,
        probeurl: "http://expensive-rpc.local/probe",
        purchaseurl: "http://expensive-rpc.local/rpc-pack",
        rpcurl: "http://expensive-rpc.local/rpc",
        pricetinybars: 50000n,
        chainid: 11155111n,
        category: "rpc",
        payto: "0.0.11326899",
        expiresat: new Date(Date.now() + 86400000).toISOString(),
      },
    ] satisfies CapabilityOfferRow[]);

  const ensByName: Record<string, EnsSellerResolution> = opts?.ensByName ?? {
    "good.neverdown.eth": {
      ensName: "good.neverdown.eth",
      normalizedEnsName: "good.neverdown.eth",
      address: "0x1111111111111111111111111111111111111111",
      records: { hederaAccount: "0.0.11326899", x402Url: "http://localhost:4001", category: "rpc" },
      resolverAddress: null,
    },
  };

  const installed = opts?.gatewayStandby ?? [];
  const store = openBudgetStore(":memory:");

  return {
    async discover_offers({ category, maxPriceTinybars }) {
      const max = BigInt(maxPriceTinybars);
      return offers
        .filter((o) => o.category === category && o.pricetinybars <= max)
        .sort((a, b) => (a.pricetinybars < b.pricetinybars ? -1 : 1));
    },
    async resolve_seller({ ensName, expectedPayTo }) {
      const key = ensName.trim().toLowerCase();
      const row = ensByName[key];
      if (!row) throw new Error(`ENS not found (hermetic): ${ensName}`);
      if (row.records.hederaAccount?.trim() !== expectedPayTo.trim()) {
        throw new Error(`ENS payTo mismatch for ${ensName}`);
      }
      return row;
    },
    async proof_of_capability({ rpcUrl, expectedChainId, payTo, ensPayTo }) {
      // Hermetic: pass when payTo matches and url looks like a candidate (not evil).
      const payOk = payTo.trim() === ensPayTo.trim();
      const urlOk = !rpcUrl.includes("evil");
      const chainOk = String(expectedChainId) === "11155111" || String(expectedChainId).toLowerCase() === "0xaa36a7";
      const pass = payOk && urlOk && chainOk;
      return {
        pass,
        checks: [
          { name: "chainId", pass: chainOk, detail: chainOk ? "ok" : "bad chain" },
          { name: "freshness", pass, detail: pass ? "ok" : "skip" },
          { name: "smoke", pass: urlOk, detail: urlOk ? "ok" : "bad url" },
          { name: "latency", pass: true, detail: "ok" },
          { name: "payToMatch", pass: payOk, detail: payOk ? "ok" : "mismatch" },
        ],
        candidateChainId: "0xaa36a7",
        latencyMs: 12,
      };
    },
    async request_purchase({ purchaseId, serviceId, sellerUrl, payTo, amountTinybars }) {
      const endpoint = sellerUrl || "http://candidate-rpc.local";
      const policy = loadPolicyConfig({
        HEDERA_NETWORK: "testnet",
        HEDERA_SPEND_ID: "0.0.1111",
        HEDERA_MERCHANT_ACCOUNT_ID: "0.0.11326899",
        POLICY_ALLOWLIST: "0.0.11326899",
        POLICY_CAP_TINYBARS: "30000",
        POLICY_TOTAL_BUDGET_TINYBARS: "30000",
        POLICY_SERVICES: serviceId,
        HEDERA_X402_PRICE_SMALLEST_UNITS: "10000",
        POLICY_ENDPOINTS: endpoint,
      });
      const decision = await authorizePurchase({
        policy,
        paymentRequirements: { x402Version: 2, error: "Payment required", resource: { url: `${endpoint}/rpc`, description: "agent", mimeType: "application/json" }, accepts: [{ scheme: "exact", network: "hedera:testnet", amount: amountTinybars, asset: "0.0.0", payTo, maxTimeoutSeconds: 60 }] } as any,
        store,
        serviceId,
        purchaseId,
        endpoint,
      });
      if (!decision.approved) {
        return { approved: false, denyReason: decision.denyReason, message: decision.message };
      }
      store.transition(purchaseId, "SETTLED", "committed");
      return { approved: true, settled: true, transactionId: `hermetic-tx-${purchaseId}` };
    },
    async install_standby({ rpcUrl }) {
      installed.push({ url: rpcUrl });
      return { installed: true, detail: { providerId: "standby", url: rpcUrl, mode: "hermetic" } };
    },
    async force_bad_purchase({ purchaseId, serviceId, badPayTo, amountTinybars }) {
      const policy = loadPolicyConfig({
        HEDERA_NETWORK: "testnet",
        HEDERA_SPEND_ID: "0.0.1111",
        HEDERA_MERCHANT_ACCOUNT_ID: "0.0.11326899",
        POLICY_ALLOWLIST: "0.0.11326899",
        POLICY_CAP_TINYBARS: "30000",
        POLICY_TOTAL_BUDGET_TINYBARS: "30000",
        POLICY_SERVICES: serviceId,
        POLICY_ENDPOINTS: "http://seller",
        HEDERA_X402_PRICE_SMALLEST_UNITS: "10000",
      });
      const decision = await authorizePurchase({
        policy,
        paymentRequirements: challengeFor(badPayTo, amountTinybars),
        store,
        serviceId,
        purchaseId,
      });
      return {
        approved: decision.approved,
        denyReason: decision.approved ? undefined : decision.denyReason,
        message: decision.approved ? undefined : decision.message,
      };
    },
  };
}

/** Live-ish toolbelt: Arkiv/ENS/PoC/policy when env is filled; install hits gateway admin API. */
export function createLiveToolBelt(env: NodeJS.ProcessEnv = process.env): AgentToolBelt {
  const store = openBudgetStore(env.POLICY_DB_PATH?.trim() || ":memory:");
  const gatewayUrl = (env.GATEWAY_URL?.trim() || "http://localhost:8787").replace(/\/$/, "");
  const gatewayToken = env.GATEWAY_INTERNAL_TOKEN?.trim() || "";

  return {
    async discover_offers(input) {
      const rows = await discoverOffers({
        category: input.category,
        maxPriceTinybars: input.maxPriceTinybars,
      });
      return [...rows].sort((a, b) => (a.pricetinybars < b.pricetinybars ? -1 : a.pricetinybars > b.pricetinybars ? 1 : 0));
    },
    async resolve_seller({ ensName, expectedPayTo }) {
      const rpc = env.ENS_RPC_URL?.trim();
      if (!rpc) throw new Error("ENS_RPC_URL required for live resolve_seller");
      const allow = (env.ENS_ALLOWLIST_NAMES ?? "")
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      return resolveAndValidateEnsSeller(ensName, expectedPayTo, rpc, allow.length ? allow : undefined);
    },
    async proof_of_capability(input) {
      return proofOfCapability({
        ...input,
        referenceRpcUrl: env.POC_REFERENCE_RPC?.trim(),
      });
    },
    async request_purchase({ purchaseId, serviceId, sellerUrl, payTo, amountTinybars }) {
      const policy = loadPolicyConfig(env);
      const decision = await authorizePurchase({
        policy,
        paymentRequirements: { x402Version: 2, error: "Payment required", resource: { url: `${sellerUrl}/rpc`, description: "agent", mimeType: "application/json" }, accepts: [{ scheme: "exact", network: policy.network, amount: amountTinybars, asset: policy.asset, payTo, maxTimeoutSeconds: 60 }] } as any,
        store,
        serviceId,
        purchaseId,
        endpoint: sellerUrl,
      });
      if (!decision.approved) {
        return { approved: false, denyReason: decision.denyReason, message: decision.message };
      }
      // Reservation already RESERVED by authorizePurchase. Live x402 settle stays opt-in (pay:once).
      return {
        approved: true,
        settled: false,
        transactionId: undefined,
        message: `authorized/reserved for ${sellerUrl}; run pnpm pay:once for live settle if needed`,
      };
    },
    async install_standby({ rpcUrl }) {
      const res = await fetch(`${gatewayUrl}/_internal/install-standby`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(gatewayToken ? { "x-gateway-internal-token": gatewayToken } : {}),
        },
        body: JSON.stringify({ url: rpcUrl }),
      });
      const detail = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { installed: false, detail: { status: res.status, detail } };
      }
      return { installed: true, detail };
    },
    async force_bad_purchase({ purchaseId, serviceId, badPayTo, amountTinybars }) {
      const policy = loadPolicyConfig(env);
      const decision = await authorizePurchase({
        policy,
        paymentRequirements: challengeFor(badPayTo, amountTinybars, policy.network, policy.asset),
        store,
        serviceId,
        purchaseId,
        endpoint: "http://seller",
      });
      return {
        approved: decision.approved,
        denyReason: decision.approved ? undefined : decision.denyReason,
        message: decision.approved ? undefined : decision.message,
      };
    },
  };
}
