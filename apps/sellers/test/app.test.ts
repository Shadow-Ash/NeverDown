import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import {
  decodePaymentRequired,
  fakeFacilitator,
  listen,
  testConfig,
  TEST_ASSET,
  TEST_FEE_PAYER,
  TEST_MERCHANT,
  TEST_PRICE,
} from "./helpers.js";

const VALID_RPC = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };

type Ctx = {
  baseUrl: string;
  close: () => Promise<void>;
  executed: string[];
  facilitator: ReturnType<typeof fakeFacilitator>;
  upstreamCalls: number;
};

async function start(): Promise<Ctx> {
  const executed: string[] = [];
  const facilitator = fakeFacilitator();
  const counters = { upstreamCalls: 0 };
  const app = createApp({
    config: testConfig({ rpcMode: "upstream", rpcUpstreamUrl: "https://rpc.example.com/" }),
    facilitatorClient: facilitator,
    onExecute: (method) => executed.push(method),
    fetchImpl: (async () => {
      counters.upstreamCalls += 1;
      throw new Error("upstream must not be called without payment");
    }) as typeof fetch,
  });
  const srv = await listen(app);
  return { ...srv, executed, facilitator, get upstreamCalls() { return counters.upstreamCalls; } };
}

async function post(ctx: Ctx, body: string | object, headers: Record<string, string> = {}) {
  return fetch(`${ctx.baseUrl}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("C1 x402 RPC seller", () => {
  let ctx: Ctx;
  before(async () => {
    ctx = await start();
  });
  after(async () => {
    await ctx.close();
  });

  it("Test A: GET /health is public and returns 200", async () => {
    const res = await fetch(`${ctx.baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      status: "ok",
      service: "neverdown-rpc-seller",
      network: "hedera:testnet",
    });
  });

  it("Test B: unauthenticated POST /rpc returns 402 with a payment challenge header", async () => {
    const res = await post(ctx, VALID_RPC);
    assert.equal(res.status, 402);
    assert.ok(res.headers.get("payment-required"), "PAYMENT-REQUIRED header must be present");
  });

  it("Test C: the decoded challenge advertises the configured Hedera testnet exact payment", async () => {
    const res = await post(ctx, VALID_RPC);
    const challenge = decodePaymentRequired(res.headers.get("payment-required")!) as {
      x402Version: number;
      resource?: { url?: string };
      accepts: Array<Record<string, unknown>>;
    };
    assert.equal(challenge.x402Version, 2);
    assert.equal(challenge.accepts.length, 1);
    const option = challenge.accepts[0];
    assert.equal(option.scheme, "exact");
    assert.equal(option.network, "hedera:testnet");
    assert.equal(option.payTo, TEST_MERCHANT);
    assert.equal(option.asset, TEST_ASSET);
    assert.equal(option.amount, TEST_PRICE);
    assert.equal(typeof option.maxTimeoutSeconds, "number");
    assert.ok((option.maxTimeoutSeconds as number) > 0);
    assert.equal((option.extra as { feePayer?: string }).feePayer, TEST_FEE_PAYER);
    assert.ok(challenge.resource?.url?.endsWith("/rpc"), "resource url should point at /rpc");
  });

  it("Test D: unpaid requests never reach the RPC handler or upstream", async () => {
    const before = ctx.executed.length;
    await post(ctx, VALID_RPC);
    await post(ctx, VALID_RPC);
    assert.equal(ctx.executed.length, before);
    assert.equal(ctx.upstreamCalls, 0);
  });

  it("Test E: malformed or disallowed JSON-RPC is rejected before payment and never executes", async () => {
    const cases: Array<string | object> = [
      "{not json",
      [VALID_RPC, VALID_RPC],
      { id: 1, method: "eth_blockNumber" },
      { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [] },
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: ["latest"] },
      { jsonrpc: "2.0", method: "eth_blockNumber" },
    ];
    const executedBefore = ctx.executed.length;
    const verifyBefore = ctx.facilitator.verifyCalls;
    for (const body of cases) {
      const res = await post(ctx, body);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      const json = (await res.json()) as { error: { code: number } };
      assert.ok(json.error.code < 0);
    }
    assert.equal(ctx.executed.length, executedBefore);
    assert.equal(ctx.facilitator.verifyCalls, verifyBefore, "invalid requests must not reach the facilitator");
  });

  it("Test G: fake payment headers or payloads do not grant access", async () => {
    const executedBefore = ctx.executed.length;
    const fakeBase64 = Buffer.from(JSON.stringify({ x402Version: 2, payload: { signature: "0xdead" } })).toString("base64");
    const variants: Record<string, string>[] = [
      { "x-payment": "paid" },
      { "payment-signature": "bogus" },
      { "payment-signature": fakeBase64 },
      { "x-neverdown-paid": "true" },
    ];
    for (const headers of variants) {
      const res = await post(ctx, VALID_RPC, headers);
      assert.notEqual(res.status, 200, `fake payment ${JSON.stringify(headers)} must not succeed`);
      assert.equal(res.status, 402);
    }
    assert.equal(ctx.executed.length, executedBefore);
  });
});
