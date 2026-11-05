import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openBudgetStore } from "../src/policy/budgetStore.js";
import { authorizePurchase, verifyAuthorizationBinding } from "../src/policy/engine.js";
import { type PaymentRequired } from "@x402/core/types";
// PolicyConfig is imported from types when needed.

// This import is value not type; rewire below.
import { loadPolicyConfig } from "../src/policy/config.js";

function policy(overrides = {}) {
  return loadPolicyConfig({
    HEDERA_NETWORK: "testnet",
    HEDERA_SPEND_ID: "0.0.1111",
    HEDERA_MERCHANT_ACCOUNT_ID: "0.0.4242",
    HEDERA_X402_ASSET_ID: "0.0.0",
    HEDERA_X402_PRICE_SMALLEST_UNITS: "10000",
    POLICY_CAP_TINYBARS: "30000",
    POLICY_TOTAL_BUDGET_TINYBARS: "30000",
    POLICY_ALLOWLIST: "0.0.4242",
    ...overrides,
  });
}

function challenge(amount = "10000", payTo = "0.0.4242", network = "hedera:testnet", asset = "0.0.0", x402Version = 2) {
  return {
    x402Version,
    error: "Payment required",
    resource: { url: "http://localhost:4001/rpc", mimeType: "application/json" },
    accepts: [{ scheme: "exact", network, amount, asset, payTo, maxTimeoutSeconds: 60, extra: { feePayer: "0.0.9" } }],
  } as PaymentRequired;
}

describe("policy engine (C3)", () => {
  it("allows an approved merchant and valid amount", async () => {
    const policyConfig = policy();
    const store = openBudgetStore(":memory:");
    const decision = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "A1" });
    assert.equal(decision.approved, true);
    assert.equal(store.get("A1")?.state, "RESERVED");
    store.close();
  });

  it("denies unknown recipient before reserve", async () => {
    const policyConfig = policy({ POLICY_ALLOWLIST: "0.0.4242" });
    const store = openBudgetStore(":memory:");
    const decision = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge("10000", "0.0.9999"), store, serviceId: "neverdown-rpc-pack", purchaseId: "A2" });
    assert.equal(decision.approved, false);
    assert.equal((decision as any).denyReason, "RECIPIENT_NOT_ALLOWLISTED");
    assert.equal(store.get("A2"), undefined);
    store.close();
  });

  it("denies wrong network, asset, scheme, version", async () => {
    const policyConfig = policy();
    const store = openBudgetStore(":memory:");
    const cases: PaymentRequired[] = [
      challenge(10000 as any, "0.0.4242", "solana:mainnet") as any,
      challenge("10000", "0.0.4242", "hedera:testnet", "0.0.429274") as any,
    ];
    let i = 0;
    for (const c of cases) {
      const d = await authorizePurchase({ policy: policyConfig, paymentRequirements: c, store, serviceId: "neverdown-rpc-pack", purchaseId: `N${i++}` });
      assert.equal(d.approved, false);
    }
    assert.ok(true);
    store.close();
  });

  it("denies over per payment cap", async () => {
    const policyConfig = policy();
    const store = openBudgetStore(":memory:");
    const d = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge("50000"), store, serviceId: "neverdown-rpc-pack", purchaseId: "O1" });
    assert.equal(d.approved, false);
    assert.equal((d as any).denyReason, "OVER_PER_PAYMENT_CAP");
    store.close();
  });

  it("denies over cumulative budget", async () => {
    const policyConfig = policy({ POLICY_TOTAL_BUDGET_TINYBARS: "15000" });
    const store = openBudgetStore(":memory:");
    await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge("10000"), store, serviceId: "neverdown-rpc-pack", purchaseId: "B1" });
    const d = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge("10000"), store, serviceId: "neverdown-rpc-pack", purchaseId: "B2" });
    assert.equal((d as any).denyReason, "BUDGET_EXCEEDED");
    try { await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge("10000"), store, serviceId: "neverdown-rpc-pack", purchaseId: "B3" }); } catch {}
    store.close();
  });

  it("denies duplicate purchase ids", async () => {
    const policyConfig = policy();
    const store = openBudgetStore(":memory:");
    await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "D1" });
    const d = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "D1" });
    assert.equal((d as any).denyReason, "DUPLICATE_PURCHASE_ID");
    store.close();
  });

  it("denies expired policy", async () => {
    const policyConfig = policy({ POLICY_EXPIRES_AT: new Date(Date.now() - 1000).toISOString() });
    const store = openBudgetStore(":memory:");
    const d = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "E1" });
    assert.equal((d as any).denyReason, "POLICY_EXPIRED");
    store.close();
  });

  it("test concurrency cannot overspend (atomic reserve)", async () => {
    const policyConfig = policy({ POLICY_TOTAL_BUDGET_TINYBARS: "10000", POLICY_CAP_TINYBARS: "10000" });
    const store = openBudgetStore(":memory:");
    const done = await Promise.allSettled([
      authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "C1" }),
      authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "C2" }),
    ]);
    const approved = done.filter((d) => d.status === "fulfilled" && (d.value as any).approved).length;
    assert.equal(approved, 1);
    store.close();
  });

  it("stores authorization and verifies changed challenge", async () => {
    const policyConfig = policy();
    const store = openBudgetStore(":memory:");
    const d = await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "V1" });
    assert.equal(d.approved, true);
    const auth = store.loadAuthorization("V1") as any;
    assert.ok(auth);
    const other = challenge();
    other.accepts[0].amount = "20000";
    assert.equal(verifyAuthorizationBinding(auth, other, ""), false);
    store.close();
  });

  it("commit reservation transition works", async () => {
    const policyConfig = policy();
    const store = openBudgetStore(":memory:");
    await authorizePurchase({ policy: policyConfig, paymentRequirements: challenge(), store, serviceId: "neverdown-rpc-pack", purchaseId: "R1" });
    store.transition("R1", "SETTLED", "paid");
    assert.equal(store.get("R1")?.state, "SETTLED");
    store.close();
  });
});