/**
 * Create a Hedera testnet HCS topic for NeverDown PAY/DENY audit (C3).
 *
 * Requires HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY in root .env
 * (may reuse the spend account for the hackathon).
 *
 * Run: pnpm hcs:create-topic
 */
import { createAuditTopic } from "../packages/core/src/hcs/index.js";

async function main(): Promise<void> {
  const accountId = process.env.HEDERA_OPERATOR_ID?.trim();
  const privateKey = process.env.HEDERA_OPERATOR_KEY?.trim();
  if (!accountId || !privateKey) {
    console.error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env first.");
    console.error("Hackathon tip: copy HEDERA_SPEND_ID/KEY into the operator vars.");
    process.exitCode = 1;
    return;
  }

  console.log(`Creating HCS topic with operator ${accountId} …`);
  const topicId = await createAuditTopic({ accountId, privateKey, network: "testnet" });
  console.log(`HEDERA_TOPIC_ID=${topicId}`);
  console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);
  console.log("Paste HEDERA_TOPIC_ID into root .env, then run pnpm policy:smoke");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
