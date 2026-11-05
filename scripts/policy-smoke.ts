/**
 * C3 live smoke: good PAY + three DENY reasons against local sellers + HCS topic.
 *
 * Prerequisites:
 * - Sellers: `pnpm --filter @neverdown/sellers dev`
 * - `.env`: spend, operator, topic, POLICY_ALLOWLIST, POLICY_CAP_TINYBARS
 *
 * Run: `pnpm policy:smoke`
 */
import {
  PolicyConfigError,
  PolicyEngine,
  fetchRecentAuditMessages,
  loadPolicyRuntimeConfig,
  mirrorTopicUrl,
} from "../packages/core/src/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  let runtime;
  try {
    runtime = loadPolicyRuntimeConfig(process.env);
  } catch (err) {
    if (err instanceof PolicyConfigError) {
      console.error(`Config error${err.envVar ? ` (${err.envVar})` : ""}: ${err.message}`);
      console.error("See docs/C3-POLICY-HCS.md — create topic with pnpm hcs:create-topic if needed.");
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const merchant =
    process.env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() ||
    runtime.state.allowlist[0]?.payTo;
  if (!merchant) {
    console.error("Missing merchant payTo (HEDERA_MERCHANT_ACCOUNT_ID or POLICY_ALLOWLIST)");
    process.exitCode = 1;
    return;
  }

  const price = BigInt(process.env.HEDERA_X402_PRICE_SMALLEST_UNITS?.trim() || "10000");
  const engine = new PolicyEngine({
    state: runtime.state,
    buyer: runtime.buyer,
    operator: runtime.operator,
    topicId: runtime.topicId,
  });

  console.log(`Topic: ${runtime.topicId}`);
  console.log(`HashScan topic: ${mirrorTopicUrl(runtime.topicId)}`);
  console.log(`Cap: ${runtime.state.capTinybars} tinybars · spent: ${runtime.state.spentTinybars}`);
  console.log("");

  // 1) OFF_ALLOWLIST
  {
    console.log("— Scenario: OFF_ALLOWLIST");
    const r = await engine.authorizePurchase({
      sellerId: "not-allowlisted-seller",
      payTo: merchant,
      amountTinybars: price,
    });
    if (r.ok || r.reason !== "OFF_ALLOWLIST") {
      console.error("Expected DENY OFF_ALLOWLIST", r);
      process.exitCode = 1;
      return;
    }
    console.log(`DENY OFF_ALLOWLIST ok (HCS ${r.hcs?.transactionId ?? "n/a"})`);
  }

  // 2) PAYTO_MISMATCH
  {
    console.log("— Scenario: PAYTO_MISMATCH");
    const r = await engine.authorizePurchase({
      sellerId: "neverdown-rpc",
      payTo: "0.0.1",
      amountTinybars: price,
    });
    if (r.ok || r.reason !== "PAYTO_MISMATCH") {
      console.error("Expected DENY PAYTO_MISMATCH", r);
      process.exitCode = 1;
      return;
    }
    console.log(`DENY PAYTO_MISMATCH ok (HCS ${r.hcs?.transactionId ?? "n/a"})`);
  }

  // 3) OVER_CAP — use a temporary engine with tiny remaining budget
  {
    console.log("— Scenario: OVER_CAP");
    const tight = new PolicyEngine({
      state: {
        ...runtime.state,
        capTinybars: price - 1n > 0n ? price - 1n : 1n,
        spentTinybars: 0n,
      },
      buyer: runtime.buyer,
      operator: runtime.operator,
      topicId: runtime.topicId,
    });
    const r = await tight.authorizePurchase({
      sellerId: "neverdown-rpc",
      payTo: merchant,
      amountTinybars: price,
    });
    if (r.ok || r.reason !== "OVER_CAP") {
      console.error("Expected DENY OVER_CAP", r);
      process.exitCode = 1;
      return;
    }
    console.log(`DENY OVER_CAP ok (HCS ${r.hcs?.transactionId ?? "n/a"})`);
  }

  // 4) Good PAY (live x402)
  {
    console.log("— Scenario: PAY (live x402)");
    const r = await engine.authorizePurchase({
      sellerId: "neverdown-rpc",
      payTo: merchant,
      amountTinybars: price,
    });
    if (!r.ok) {
      console.error("Expected PAY", r);
      process.exitCode = 1;
      return;
    }
    console.log(`PAY ok · HashScan settle: ${r.payment.hashscanUrl}`);
    console.log(`HCS submit: ${r.hcs.transactionId}`);
    console.log(`Spent now: ${r.spentTinybars} / ${runtime.state.capTinybars}`);
  }

  console.log("");
  console.log("Waiting for Mirror Node to index topic messages …");
  await sleep(4000);
  const messages = await fetchRecentAuditMessages(runtime.topicId, { limit: 10 });
  const types = messages.map((m) =>
    m.event.type === "DENY" ? `DENY:${m.event.reason}` : "PAY",
  );
  console.log(`Recent audit events (${messages.length}): ${types.join(", ") || "(none yet)"}`);
  console.log(`Mirror: https://testnet.mirrornode.hedera.com/api/v1/topics/${runtime.topicId}/messages`);
  console.log("C3 smoke complete.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
