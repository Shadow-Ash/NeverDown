import { loadHcsConfig } from "../packages/core/src/hcs/config.js";
import { HederaHcsClient } from "../packages/core/src/hcs/client.js";
import { canonicalize, hashCanonical } from "../packages/core/src/hcs/evidence.js";
import type { HcsEvent } from "../packages/core/src/hcs/types.js";

async function main() {
  const cfg = loadHcsConfig(process.env);
  if (!cfg) throw new Error("HCS disabled: missing HEDERA_TOPIC_ID or HEDERA_OPERATOR_* credentials");

  const event: HcsEvent = {
    schemaVersion: "nd-audit-v1",
    eventId: "hcs-smoke-" + Date.now(),
    purchaseId: "smoke-purchase",
    policyId: "neverdown-demo-v1",
    policyVersion: 1,
    eventType: "PURCHASE_AUTHORIZED",
    occurredAt: new Date().toISOString(),
    buyerAccountReference: process.env.HEDERA_SPEND_ID?.trim() || "unset",
    sellerPayTo: process.env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() || "unset",
    network: "hedera:testnet",
    asset: "0.0.0",
    amountTinybars: "0",
    reasonCode: "SMOKE",
    requirementHash: hashCanonical({ demo: "requirements" }),
    evidenceHash: hashCanonical({demo:"evidence"}),
    previousEventHash: null,
  };
  const client = new HederaHcsClient(cfg);
  console.log("Submitting to HCS topic", cfg.topicId);
  const result = await client.submit(event as any);
  if (result.status !== "published") {
    throw new Error(`HCS submission failed: ${result.error ?? "unknown"}`);
  }
  console.log("Transaction ID:", result.transactionId);
  console.log("Sequence number:", result.sequenceNumber);
  console.log("Consensus timestamp:", result.consensusTimestamp);
  console.log("HashScan topic:", `https://hashscan.io/testnet/topic/${cfg.topicId}`);
  // Mirror check
  const seq = result.sequenceNumber!;
  const url = `${cfg.mirrorNodeUrl}/api/v1/topics/${cfg.topicId}/messages/${seq}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.log("Mirror verification: PENDING (indexing maybe)");
    console.log("Verification result:", "PENDING");
  } else {
    const json = await resp.json();
    const payload = Buffer.from(json.message, "base64").toString("utf8");
    const parsed = JSON.parse(payload);
    const match = JSON.stringify(parsed) === JSON.stringify(event) || hashCanonical(parsed) === hashCanonical(event);
    console.log("Mirror message decoded:", match ? "MATCH" : "MISMATCH");
    console.log("Verification result:", match ? "VERIFIED" : "MISMATCH");
  }
  process.exitCode = result.status === "published" ? 0 : 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });