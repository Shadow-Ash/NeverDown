import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PayOnceError,
  hashscanTestnetUrl,
  payForRpcOnce,
  payForRpcPack,
} from "../src/x402/payOnce.js";
import type { x402HTTPClient } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, SettleResponse } from "@x402/core/types";

function encodeHeader(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function fakeHttpClient(overrides: Partial<{
  paymentRequired: PaymentRequired;
  payload: PaymentPayload;
  settle: SettleResponse;
}> = {}): x402HTTPClient {
  const paymentRequired = (overrides.paymentRequired ?? {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: "http://localhost:4001/rpc",
      description: "test",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "hedera:testnet",
        amount: "10000",
        asset: "0.0.0",
        payTo: "0.0.4242",
        maxTimeoutSeconds: 60,
        extra: { feePayer: "0.0.9185802" },
      },
    ],
  }) as PaymentRequired;

  const payload = (overrides.payload ?? {
    x402Version: 2,
    resource: paymentRequired.resource,
    accepted: paymentRequired.accepts[0],
    payload: { transaction: "AAAA" },
  }) as PaymentPayload;

  const settle = (overrides.settle ?? {
    success: true,
    transaction: "0.0.9185802@1700000000.000000001",
    network: "hedera:testnet",
  }) as SettleResponse;

  return {
    getPaymentRequiredResponse: () => paymentRequired,
    createPaymentPayload: async () => payload,
    encodePaymentSignatureHeader: () => ({ "PAYMENT-SIGNATURE": "dGVzdA==" }),
    getPaymentSettleResponse: () => settle,
  } as unknown as x402HTTPClient;
}

describe("hashscanTestnetUrl", () => {
  it("builds a HashScan testnet link", () => {
    const id = "0.0.1@2.3";
    assert.equal(
      hashscanTestnetUrl(id),
      `https://hashscan.io/testnet/transaction/${encodeURIComponent(id)}`,
    );
  });
});

describe("payForRpcOnce (hermetic, mocked fetch — not live Hedera)", () => {
  it("sends PAYMENT-SIGNATURE on retry and returns settlement + HashScan URL", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers as Record<string, string> | undefined) });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: {
            "content-type": "application/json",
            "PAYMENT-REQUIRED": encodeHeader({
              x402Version: 2,
              accepts: [{ scheme: "exact", network: "hedera:testnet" }],
            }),
          },
        });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x10" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "PAYMENT-RESPONSE": encodeHeader({
            success: true,
            transaction: "0.0.9185802@1700000000.000000001",
            network: "hedera:testnet",
          }),
        },
      });
    };

    const result = await payForRpcOnce({
      sellerUrl: "http://localhost:4001",
      httpClient: fakeHttpClient(),
      fetchImpl,
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "http://localhost:4001/rpc");
    assert.equal(calls[1].url, "http://localhost:4001/rpc");
    assert.equal(calls[1].headers.get("PAYMENT-SIGNATURE"), "dGVzdA==");
    assert.equal(result.rpcResult, "0x10");
    assert.equal(result.transactionId, "0.0.9185802@1700000000.000000001");
    assert.ok(result.hashscanUrl.includes("hashscan.io/testnet/transaction/"));
  });

  it("errors when first response is not 402", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("{}", { status: 500, headers: { "content-type": "application/json" } });
    await assert.rejects(
      () =>
        payForRpcOnce({
          sellerUrl: "http://localhost:4001",
          httpClient: fakeHttpClient(),
          fetchImpl,
        }),
      (err: unknown) => err instanceof PayOnceError && /Expected HTTP 402/.test(err.message),
    );
  });

  it("errors when paid response is not 200", async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async () => {
      n += 1;
      if (n === 1) {
        return new Response("{}", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": encodeHeader({ x402Version: 2, accepts: [] }) },
        });
      }
      return new Response("nope", { status: 402 });
    };
    await assert.rejects(
      () =>
        payForRpcOnce({
          sellerUrl: "http://localhost:4001",
          httpClient: fakeHttpClient(),
          fetchImpl,
        }),
      (err: unknown) => err instanceof PayOnceError && /Paid request failed/.test(err.message),
    );
  });
});

it("pays for a pack and returns the settled entitlement token", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(String(input));
    if (calls.length === 1) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { "PAYMENT-REQUIRED": encodeHeader({ x402Version: 2, accepts: [] }) } });
    assert.ok(new Headers(init?.headers).has("PAYMENT-SIGNATURE"));
    return new Response(JSON.stringify({ token: "settled-token-12345678901234567890", maxRequests: 100 }), { status: 200, headers: { "PAYMENT-RESPONSE": encodeHeader({ success: true, transaction: "0.0.1@1.2", network: "hedera:testnet" }) } });
  };
  const result = await payForRpcPack({ purchaseUrl: "http://localhost:4001/rpc-pack", httpClient: fakeHttpClient(), fetchImpl });
  assert.deepEqual(calls, ["http://localhost:4001/rpc-pack", "http://localhost:4001/rpc-pack"]);
  assert.equal(result.entitlementToken, "settled-token-12345678901234567890");
  assert.equal(result.transactionId, "0.0.9185802@1700000000.000000001");
});
