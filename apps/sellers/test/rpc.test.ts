import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forwardToUpstream, mockResult, validateJsonRpc, type JsonRpcRequest } from "../src/rpc.js";

const req: JsonRpcRequest = { jsonrpc: "2.0", id: 7, method: "eth_chainId", params: [] };

function stubFetch(handler: () => Response | Promise<Response>): typeof fetch {
  return (async () => handler()) as unknown as typeof fetch;
}

describe("validateJsonRpc", () => {
  it("accepts only the latest block header form for eth_getBlockByNumber", () => {
    const good = validateJsonRpc({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] });
    assert.equal(good.ok, true);
    for (const params of [[], ["0x1", false], ["latest", true]]) {
      const bad = validateJsonRpc({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params });
      assert.equal(bad.ok, false);
    }
  });
  it("accepts the three mock-supported methods", () => {
    for (const method of ["eth_chainId", "eth_blockNumber", "net_version"]) {
      const r = validateJsonRpc({ jsonrpc: "2.0", id: "a", method });
      assert.equal(r.ok, true, method);
    }
  });

  it("returns invalid-request errors that echo the id when it is valid", () => {
    const r = validateJsonRpc({ jsonrpc: "1.0", id: 5, method: "eth_chainId" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.id, 5);
      assert.equal(r.error.code, -32600);
    }
  });

  it("returns method-not-found for methods outside the allowlist", () => {
    const r = validateJsonRpc({ jsonrpc: "2.0", id: 1, method: "eth_sendTransaction" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, -32601);
  });
});

describe("mockResult", () => {
  it("returns a block header for the capability smoke check", () => {
    assert.deepEqual(mockResult("eth_getBlockByNumber"), { number: "0x10" });
  });
  it("returns deterministic values for a local mock chain", () => {
    assert.equal(mockResult("eth_chainId"), "0x7a69");
    assert.equal(mockResult("net_version"), "31337");
    assert.equal(mockResult("eth_blockNumber"), "0x10");
  });
});

describe("forwardToUpstream", () => {
  it("returns the upstream result and sends only validated fields to the fixed URL", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 7, result: "0x1" }));
    }) as unknown as typeof fetch;

    const outcome = await forwardToUpstream("https://rpc.example.com/", req, fetchImpl);

    assert.deepEqual(outcome, { ok: true, result: "0x1" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://rpc.example.com/");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.redirect, "error");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      jsonrpc: "2.0",
      id: 7,
      method: "eth_chainId",
      params: [],
    });
  });

  it("maps HTTP failures to a generic upstream error without leaking the body", async () => {
    const outcome = await forwardToUpstream(
      "https://rpc.example.com/",
      req,
      stubFetch(() => new Response("secret upstream detail", { status: 500 })),
    );
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.error.code, -32603);
      assert.ok(!outcome.error.message.includes("secret"));
    }
  });

  it("treats network errors and JSON-RPC errors as upstream failures", async () => {
    const thrown = await forwardToUpstream(
      "https://rpc.example.com/",
      req,
      stubFetch(() => {
        throw new TypeError("fetch failed");
      }),
    );
    assert.equal(thrown.ok, false);

    const rpcErr = await forwardToUpstream(
      "https://rpc.example.com/",
      req,
      stubFetch(() => new Response(JSON.stringify({ jsonrpc: "2.0", id: 7, error: { code: -1, message: "x" } }))),
    );
    assert.equal(rpcErr.ok, false);
  });

  it("rejects oversized upstream responses", async () => {
    const big = JSON.stringify({ jsonrpc: "2.0", id: 7, result: "x".repeat(1_100_000) });
    const outcome = await forwardToUpstream("https://rpc.example.com/", req, stubFetch(() => new Response(big)));
    assert.equal(outcome.ok, false);
  });
});
