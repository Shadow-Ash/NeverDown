/**
 * C7 Proof-of-Capability smoke: good candidate passes; bad chain / stale fail.
 *
 * Env (optional):
 * - POC_CANDIDATE_RPC (default: mock via local inline if unset — uses public Sepolia if GATEWAY/RPC set)
 * - POC_REFERENCE_RPC
 * - POC_EXPECTED_CHAIN_ID (default 11155111)
 *
 * Run: pnpm poc:smoke
 */
import { proofOfCapability } from "../packages/core/src/poc/index.js";

function mockServer(state: {
  chainId: string;
  block: number;
}): { url: string; fetchImpl: typeof fetch; close: () => void } {
  // In-process mock: encode state in URL host key for proofOfCapability fetch routing.
  const key = `http://poc-mock-${state.chainId}-${state.block}.local`;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith(key)) {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "wrong host" } }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
    if (body.method === "eth_chainId") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: state.chainId }), { status: 200 });
    }
    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${state.block.toString(16)}` }), { status: 200 });
    }
    if (body.method === "eth_getBlockByNumber") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { number: `0x${state.block.toString(16)}`, hash: "0xdead" } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: body.method } }), { status: 200 });
  };
  return { url: key, fetchImpl, close: () => undefined };
}

async function main(): Promise<void> {
  const payTo = process.env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() || "0.0.11326899";
  const liveCandidate = process.env.POC_CANDIDATE_RPC?.trim() || process.env.RPC_UPSTREAM_URL?.trim();
  const liveReference = process.env.POC_REFERENCE_RPC?.trim() || liveCandidate;
  const expectedChainId = process.env.POC_EXPECTED_CHAIN_ID?.trim() || "11155111";

  if (liveCandidate) {
    console.log(`Live candidate: ${liveCandidate}`);
    const good = await proofOfCapability({
      rpcUrl: liveCandidate,
      referenceRpcUrl: liveReference,
      expectedChainId,
      payTo,
      ensPayTo: payTo,
    });
    console.log("live good?", good.pass, good.checks.map((c) => `${c.name}:${c.pass ? "ok" : "FAIL"}`).join(", "));
  }

  // Deterministic hermetic scenarios (always run)
  const goodMock = mockServer({ chainId: "0xaa36a7", block: 1000 });
  const refMock = mockServer({ chainId: "0xaa36a7", block: 1005 });
  const combined: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(goodMock.url)) return goodMock.fetchImpl(input, init);
    if (url.startsWith(refMock.url)) return refMock.fetchImpl(input, init);
    return new Response("{}", { status: 404 });
  };

  const pass = await proofOfCapability({
    rpcUrl: goodMock.url,
    referenceRpcUrl: refMock.url,
    expectedChainId: 11155111,
    payTo,
    ensPayTo: payTo,
    fetchImpl: combined,
  });
  console.log("mock good →", pass.pass ? "PASS" : "FAIL", JSON.stringify(pass.checks.map((c) => c.name + ":" + c.pass)));

  const badChain = mockServer({ chainId: "0x1", block: 1000 });
  const failChain = await proofOfCapability({
    rpcUrl: badChain.url,
    expectedChainId: 11155111,
    payTo,
    ensPayTo: payTo,
    fetchImpl: badChain.fetchImpl,
  });
  console.log("mock wrong chainId →", failChain.pass ? "PASS (unexpected)" : "FAIL (expected)");

  const stale = mockServer({ chainId: "0xaa36a7", block: 10 });
  const fresh = mockServer({ chainId: "0xaa36a7", block: 100 });
  const staleFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(stale.url)) return stale.fetchImpl(input, init);
    if (url.startsWith(fresh.url)) return fresh.fetchImpl(input, init);
    return new Response("{}", { status: 404 });
  };
  const failStale = await proofOfCapability({
    rpcUrl: stale.url,
    referenceRpcUrl: fresh.url,
    expectedChainId: 11155111,
    payTo,
    ensPayTo: payTo,
    staleBlockTolerance: 20,
    fetchImpl: staleFetch,
  });
  console.log("mock stale →", failStale.pass ? "PASS (unexpected)" : "FAIL (expected)");

  const ok = pass.pass && !failChain.pass && !failStale.pass;
  process.exitCode = ok ? 0 : 1;
  console.log(ok ? "C7 poc-smoke complete." : "C7 poc-smoke FAILED");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
