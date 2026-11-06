/** Read-only live checks. Never signs, settles, or publishes an offer. */
import { inspectLiveConfiguration, checkRpcChainId } from "../packages/core/src/agent/preflight.js";
import { liveSeedSpec } from "../packages/core/src/arkiv/seed.js";
import { discoverOffers } from "../packages/core/src/arkiv/discover.js";
import { resolveAndValidateEnsSeller } from "../packages/core/src/ens/resolve.js";
import { proofOfCapability } from "../packages/core/src/poc/proofOfCapability.js";

class PreflightFailure extends Error {}

async function main(): Promise<void> {
  const issues = inspectLiveConfiguration(process.env);
  if (issues.length) {
    for (const issue of issues) console.error(`Preflight: ${issue}`);
    process.exitCode = 1;
    return;
  }
  const verifyChain = async (label: string, url: string, expected: string) => {
    try { await checkRpcChainId(url, expected); }
    catch { throw new PreflightFailure(`${label} chain check failed`); }
  };
  // ENS may be Sepolia (demo) or mainnet; RPC demo plane stays Sepolia.
  try {
    await checkRpcChainId(process.env.ENS_RPC_URL!, "0xaa36a7");
    console.log("ENS RPC answers on Sepolia");
  } catch {
    try {
      await checkRpcChainId(process.env.ENS_RPC_URL!, "0x1");
      console.log("ENS RPC answers on mainnet");
    } catch {
      throw new PreflightFailure("ENS RPC chain check failed (need Sepolia 0xaa36a7 or mainnet 0x1)");
    }
  }
  await Promise.all([
    verifyChain("gateway primary", (process.env.GATEWAY_PRIMARY_RPC_URL || process.env.GATEWAY_PRIMARY_RPC)!, "0xaa36a7"),
    verifyChain("gateway standby", (process.env.GATEWAY_STANDBY_RPC_URL || process.env.GATEWAY_STANDBY_RPC)!, "0xaa36a7"),
    verifyChain("PoC reference", process.env.POC_REFERENCE_RPC!, "0xaa36a7"),
  ]);
  console.log("Gateway/PoC providers answer on Sepolia");
  const spec = liveSeedSpec(process.env);
  const offers = await discoverOffers({ category: "rpc", maxPriceTinybars: spec.pricetinybars });
  const selected = offers.find((o) => o.sellerens === spec.sellerens && o.serviceurl === spec.serviceurl && o.payto === spec.payto && o.pricetinybars === spec.pricetinybars && o.chainid === spec.chainid && o.probeurl === spec.probeurl && o.purchaseurl === spec.purchaseurl && o.rpcurl === spec.rpcurl);
  if (!selected) throw new PreflightFailure("No matching live v2 Arkiv offer");
  console.log("Arkiv offer matches configured seller");

  const ens = await resolveAndValidateEnsSeller(spec.sellerens, spec.payto, process.env.ENS_RPC_URL!, (process.env.ENS_ALLOWLIST_NAMES || "").split(/[,\s;]+/).filter(Boolean));
  if (ens.records.x402Url?.replace(/\/+$/, "") !== spec.serviceurl) throw new PreflightFailure("ENS x402Url differs from offer");
  console.log("ENS seller records match offer");

  const proof = await proofOfCapability({ rpcUrl: spec.probeurl, referenceRpcUrl: process.env.POC_REFERENCE_RPC!, expectedChainId: Number(spec.chainid), payTo: spec.payto, ensPayTo: ens.records.hederaAccount! });
  if (!proof.pass) throw new PreflightFailure(`Capability proof failed: ${proof.checks.filter((check) => !check.pass).map((check) => check.name).join(", ")}`);
  console.log("Independent capability proof passed");

  const quote = await fetch(spec.purchaseurl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(8000) });
  if (quote.status !== 402) throw new PreflightFailure("Seller did not quote an unpaid /rpc-pack challenge");
  const raw = quote.headers.get("payment-required");
  if (!raw) throw new PreflightFailure("Seller challenge missing payment-required header");
  const challenge = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { resource?: { url?: string }; accepts?: Array<{ scheme?: string; network?: string; payTo?: string; amount?: string; asset?: string }> };
  const accept = challenge.accepts?.[0];
  if (challenge.resource?.url !== spec.purchaseurl || challenge.accepts?.length !== 1 || accept?.scheme !== "exact" || accept.network !== "hedera:testnet" || accept.asset !== "0.0.0" || accept.payTo !== spec.payto || accept.amount !== spec.pricetinybars.toString()) throw new PreflightFailure("Seller challenge differs from selected offer");
  console.log("Seller x402 challenge matches offer");

  const gatewayUrl = (process.env.GATEWAY_URL?.trim() || "http://localhost:8787").replace(/\/+$/, "");
  const gateway = await fetch(`${gatewayUrl}/status`, { signal: AbortSignal.timeout(8000) });
  if (!gateway.ok) throw new PreflightFailure("Gateway status unavailable");
  const ready = await fetch(`${gatewayUrl}/ready`, { signal: AbortSignal.timeout(8000) });
  if (!ready.ok) throw new PreflightFailure("Gateway has no healthy provider");
  console.log("Gateway status reachable");
  console.log("Live preflight passed; no payment sent");
}

main().catch((error: unknown) => {
  console.error(`Live preflight failed: ${error instanceof PreflightFailure ? error.message : "external lookup or service error"}`);
  process.exitCode = 1;
});
