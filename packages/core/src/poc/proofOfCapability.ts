import { jsonRpcCall, normalizeChainId, parseHexQuantity } from "./rpc.js";
import type { PocCheckResult, ProofOfCapabilityInput, ProofOfCapabilityResult } from "./types.js";

function normalizeAccountId(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Verify a capability endpoint (demo: JSON-RPC) is usable **now** before install/standby.
 * Failures must never lead to installing that candidate.
 */
export async function proofOfCapability(
  input: ProofOfCapabilityInput,
): Promise<ProofOfCapabilityResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const expectedChainId = normalizeChainId(input.expectedChainId);
  const staleTol = input.staleBlockTolerance ?? 20;
  const maxLatencyMs = input.maxLatencyMs ?? 3000;
  const referenceUrl = input.referenceRpcUrl?.trim() || process.env.POC_REFERENCE_RPC?.trim() || input.rpcUrl;

  const checks: PocCheckResult[] = [];
  let candidateChainId: string | undefined;
  let candidateBlockNumber: number | undefined;
  let referenceBlockNumber: number | undefined;
  let latencyMs: number | undefined;

  // 1) chainId
  try {
    const { result, latencyMs: t } = await jsonRpcCall(input.rpcUrl, "eth_chainId", [], fetchImpl);
    candidateChainId = String(result).toLowerCase();
    const pass = candidateChainId === expectedChainId;
    checks.push({
      name: "chainId",
      pass,
      detail: pass ? "chainId matches expected" : "chainId mismatch",
      observed: candidateChainId,
      expected: expectedChainId,
      latencyMs: t,
    });
  } catch (e) {
    checks.push({
      name: "chainId",
      pass: false,
      detail: e instanceof Error ? e.message : "chainId probe failed",
    });
  }

  // 2) freshness vs reference
  try {
    const cand = await jsonRpcCall(input.rpcUrl, "eth_blockNumber", [], fetchImpl);
    candidateBlockNumber = parseHexQuantity(cand.result);
    const ref = await jsonRpcCall(referenceUrl, "eth_blockNumber", [], fetchImpl);
    referenceBlockNumber = parseHexQuantity(ref.result);
    const lag = referenceBlockNumber - candidateBlockNumber;
    const pass = lag <= staleTol;
    checks.push({
      name: "freshness",
      pass,
      detail: pass
        ? `candidate within ${staleTol} blocks of reference (lag=${lag})`
        : `candidate stale vs reference (lag=${lag} > ${staleTol})`,
      observed: candidateBlockNumber,
      expected: referenceBlockNumber,
      latencyMs: cand.latencyMs,
    });
  } catch (e) {
    checks.push({
      name: "freshness",
      pass: false,
      detail: e instanceof Error ? e.message : "freshness probe failed",
    });
  }

  // 3) smoke: get latest block header
  try {
    const { result, latencyMs: t } = await jsonRpcCall(
      input.rpcUrl,
      "eth_getBlockByNumber",
      ["latest", false],
      fetchImpl,
    );
    latencyMs = t;
    const ok =
      result !== null &&
      typeof result === "object" &&
      typeof (result as { number?: unknown }).number === "string";
    checks.push({
      name: "smoke",
      pass: ok,
      detail: ok ? "eth_getBlockByNumber(latest) returned a block" : "smoke call returned empty/invalid block",
      latencyMs: t,
    });
  } catch (e) {
    checks.push({
      name: "smoke",
      pass: false,
      detail: e instanceof Error ? e.message : "smoke probe failed",
    });
  }

  // 4) latency (reuse smoke timing if present)
  {
    const smoke = checks.find((c) => c.name === "smoke");
    const observed = smoke?.latencyMs ?? latencyMs ?? null;
    const pass = observed !== null && observed <= maxLatencyMs;
    checks.push({
      name: "latency",
      pass,
      detail: pass
        ? `latency ${observed}ms <= ${maxLatencyMs}ms`
        : `latency ${observed ?? "n/a"}ms exceeds ${maxLatencyMs}ms or missing`,
      observed,
      expected: maxLatencyMs,
      latencyMs: observed ?? undefined,
    });
  }

  // 5) payTo matches ENS record
  {
    const payTo = normalizeAccountId(input.payTo);
    const ensPayTo = normalizeAccountId(input.ensPayTo);
    const pass = payTo.length > 0 && ensPayTo.length > 0 && payTo === ensPayTo;
    checks.push({
      name: "payToMatch",
      pass,
      detail: pass ? "offer payTo matches ENS hederaAccount" : "payTo does not match ENS hederaAccount",
      observed: input.payTo,
      expected: input.ensPayTo,
    });
  }

  return {
    pass: checks.every((c) => c.pass),
    checks,
    candidateChainId,
    candidateBlockNumber,
    referenceBlockNumber,
    latencyMs,
  };
}
