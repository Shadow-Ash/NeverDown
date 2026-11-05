import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuditEvent } from "../src/hcs/types.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { BuyerConfig } from "../src/x402/config.js";
import type { PayForRpcOnceResult } from "../src/x402/payOnce.js";

const buyer: BuyerConfig = {
  network: "hedera:testnet",
  spendAccountId: "0.0.1",
  spendPrivateKey: "never-used-in-deny-tests",
  sellerUrl: "http://localhost:4001",
};

function engineWithMocks(opts: {
  cap?: bigint;
  spent?: bigint;
  payTo?: string;
  payImpl?: () => Promise<PayForRpcOnceResult>;
}) {
  const events: AuditEvent[] = [];
  let payCalls = 0;
  const engine = new PolicyEngine({
    state: {
      policyVersion: "test",
      capTinybars: opts.cap ?? 50000n,
      spentTinybars: opts.spent ?? 0n,
      allowlist: [{ sellerId: "neverdown-rpc", payTo: opts.payTo ?? "0.0.11326899" }],
    },
    buyer,
    operator: { accountId: "0.0.1", privateKey: "x", network: "testnet" },
    topicId: "0.0.99",
    submitAudit: async (event) => {
      events.push(event);
      return { transactionId: "hcs-mock", sequenceNumber: events.length };
    },
    pay: async () => {
      payCalls += 1;
      if (opts.payImpl) return opts.payImpl();
      return {
        rpcResult: "0x1",
        transactionId: "0.0.1@2.3",
        hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.1%402.3",
        settle: { success: true, transaction: "0.0.1@2.3", network: "hedera:testnet" },
        httpStatus: 200,
      };
    },
  });
  return { engine, events, getPayCalls: () => payCalls };
}

describe("PolicyEngine.authorizePurchase (hermetic)", () => {
  it("DENY OFF_ALLOWLIST without calling pay", async () => {
    const { engine, events, getPayCalls } = engineWithMocks({});
    const result = await engine.authorizePurchase({
      sellerId: "evil-seller",
      payTo: "0.0.11326899",
      amountTinybars: 10000,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "OFF_ALLOWLIST");
    assert.equal(getPayCalls(), 0);
    assert.equal(events[0]?.type, "DENY");
  });

  it("DENY PAYTO_MISMATCH without calling pay", async () => {
    const { engine, events, getPayCalls } = engineWithMocks({});
    const result = await engine.authorizePurchase({
      sellerId: "neverdown-rpc",
      payTo: "0.0.999",
      amountTinybars: 10000,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "PAYTO_MISMATCH");
    assert.equal(getPayCalls(), 0);
    assert.equal(events[0]?.type, "DENY");
  });

  it("DENY OVER_CAP without calling pay", async () => {
    const { engine, events, getPayCalls } = engineWithMocks({ cap: 10000n, spent: 5000n });
    const result = await engine.authorizePurchase({
      sellerId: "neverdown-rpc",
      payTo: "0.0.11326899",
      amountTinybars: 6000,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "OVER_CAP");
    assert.equal(getPayCalls(), 0);
    assert.equal(events[0]?.type, "DENY");
  });

  it("PAY path calls pay, increments spent, logs PAY", async () => {
    const { engine, events, getPayCalls } = engineWithMocks({ cap: 50000n });
    const result = await engine.authorizePurchase({
      sellerId: "neverdown-rpc",
      payTo: "0.0.11326899",
      amountTinybars: 10000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getPayCalls(), 1);
    assert.equal(result.spentTinybars, 10000n);
    assert.equal(engine.getState().spentTinybars, 10000n);
    assert.equal(events[0]?.type, "PAY");
    if (events[0]?.type === "PAY") {
      assert.equal(events[0].txId, "0.0.1@2.3");
    }
  });
});
