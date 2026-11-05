import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { proofOfCapability } from "../src/poc/index.js";

function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

function mockFetch(handlers: Record<string, (method: string) => unknown>): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
    const handler = handlers[url];
    if (!handler) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "unknown url" } }), { status: 200 });
    try {
      const result = handler(body.method);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    } catch (e) {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: e instanceof Error ? e.message : "err" } }),
        { status: 200 },
      );
    }
  };
}

describe("proofOfCapability (hermetic)", () => {
  it("passes a healthy matching candidate", async () => {
    const candidate = "http://candidate";
    const reference = "http://reference";
    const fetchImpl = mockFetch({
      [candidate]: (method) => {
        if (method === "eth_chainId") return hex(11155111);
        if (method === "eth_blockNumber") return hex(1000);
        if (method === "eth_getBlockByNumber") return { number: hex(1000), hash: "0xabc" };
        throw new Error(`unexpected ${method}`);
      },
      [reference]: (method) => {
        if (method === "eth_blockNumber") return hex(1005);
        throw new Error(`unexpected ${method}`);
      },
    });

    const result = await proofOfCapability({
      rpcUrl: candidate,
      referenceRpcUrl: reference,
      expectedChainId: 11155111,
      payTo: "0.0.11326899",
      ensPayTo: "0.0.11326899",
      staleBlockTolerance: 20,
      maxLatencyMs: 5000,
      fetchImpl,
    });
    assert.equal(result.pass, true);
    assert.equal(result.checks.length, 5);
    assert.ok(result.checks.every((c) => c.pass));
  });

  it("fails wrong chainId", async () => {
    const url = "http://bad-chain";
    const fetchImpl = mockFetch({
      [url]: (method) => {
        if (method === "eth_chainId") return hex(1);
        if (method === "eth_blockNumber") return hex(10);
        if (method === "eth_getBlockByNumber") return { number: hex(10) };
        throw new Error(method);
      },
    });
    const result = await proofOfCapability({
      rpcUrl: url,
      expectedChainId: 11155111,
      payTo: "0.0.1",
      ensPayTo: "0.0.1",
      fetchImpl,
    });
    assert.equal(result.pass, false);
    assert.equal(result.checks.find((c) => c.name === "chainId")?.pass, false);
  });

  it("fails stale candidate", async () => {
    const candidate = "http://stale";
    const reference = "http://ref";
    const fetchImpl = mockFetch({
      [candidate]: (method) => {
        if (method === "eth_chainId") return hex(11155111);
        if (method === "eth_blockNumber") return hex(100);
        if (method === "eth_getBlockByNumber") return { number: hex(100) };
        throw new Error(method);
      },
      [reference]: (method) => {
        if (method === "eth_blockNumber") return hex(200);
        throw new Error(method);
      },
    });
    const result = await proofOfCapability({
      rpcUrl: candidate,
      referenceRpcUrl: reference,
      expectedChainId: 11155111,
      payTo: "0.0.1",
      ensPayTo: "0.0.1",
      staleBlockTolerance: 20,
      fetchImpl,
    });
    assert.equal(result.pass, false);
    assert.equal(result.checks.find((c) => c.name === "freshness")?.pass, false);
  });

  it("fails payTo mismatch (never install)", async () => {
    const url = "http://ok";
    const fetchImpl = mockFetch({
      [url]: (method) => {
        if (method === "eth_chainId") return hex(11155111);
        if (method === "eth_blockNumber") return hex(50);
        if (method === "eth_getBlockByNumber") return { number: hex(50) };
        throw new Error(method);
      },
    });
    const result = await proofOfCapability({
      rpcUrl: url,
      expectedChainId: 11155111,
      payTo: "0.0.1",
      ensPayTo: "0.0.2",
      fetchImpl,
    });
    assert.equal(result.pass, false);
    assert.equal(result.checks.find((c) => c.name === "payToMatch")?.pass, false);
  });
});
