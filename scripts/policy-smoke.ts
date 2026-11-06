import { loadPolicyConfig } from "../packages/core/src/policy/config.js";
import { openBudgetStore } from "../packages/core/src/policy/budgetStore.js";
import { authorizePurchase } from "../packages/core/src/policy/engine.js";

async function main() {
  const policy = loadPolicyConfig(process.env);
  const store = openBudgetStore(":memory:");
  const challenge = {
    x402Version: 2,
    error: "Payment required",
    resource: { url: "http://localhost:4001/rpc", mimeType: "application/json" },
    accepts: [{ scheme: "exact", network: policy.network, amount: policy.maxPerPaymentTinybars.toString(), asset: policy.asset, payTo: policy.allowedRecipients[0], maxTimeoutSeconds: 60 }],
  } as never;

  const good = await authorizePurchase({ policy, paymentRequirements: challenge as never, store, serviceId: policy.allowedServiceIds[0], purchaseId: "smoke-good" });
  console.log("good authorization:", good.approved ? "AUTHORIZED" : "DENIED " + (good as never).denyReason);

  const bad = await authorizePurchase({ policy, paymentRequirements: challenge, store, serviceId: policy.allowedServiceIds[0], purchaseId: "smoke-bad", /* force mismatch via alternate challenge */ });
  console.log("second purchase (duplicate ID):", bad.approved ? "AUTHORIZED" : "DENIED " + (bad as never).denyReason);

  const denied = await authorizePurchase({
    policy,
    paymentRequirements: {
      x402Version: 2,
      error: "Payment required",
      resource: { url: "http://localhost:4001/rpc", mimeType: "application/json" },
      accepts: [{ scheme: "exact", network: policy.network, amount: "10000", asset: policy.asset, payTo: "0.0.9999", maxTimeoutSeconds: 60 }],
    } as never,
    store,
    serviceId: policy.allowedServiceIds[0],
    purchaseId: "smoke-denied",
  });
  console.log("unknown recipient:", denied.approved ? "AUTHORIZED" : "DENIED " + denied.denyReason);
  store.close();
  process.exitCode = good.approved && (bad as never).denyReason === "DUPLICATE_PURCHASE_ID" && !denied.approved ? 0 : 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });