import { Client, AccountId, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import type { HcsConfig } from "./config.js";
import type { HcsPublishResult, HcsEvent } from "./types.js";

export class HederaHcsClient {
  constructor(private config?: HcsConfig) {}

  async submit(event: HcsEvent): Promise<HcsPublishResult> {
    if (!this.config) return { status: "disabled", error: "hcs disabled (missing config)" };

    try {
      const client = Client.forTestnet();
      client.setOperator(AccountId.fromString(this.config.operatorId), PrivateKey.fromString(this.config.operatorKey));
      const message = JSON.stringify(event);
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(this.config.topicId)
        .setMessage(message)
        .execute(client);
      const receipt = await tx.getReceipt(client);
      const record = await tx.getRecord(client);
      client.close();
      return {
        status: "published",
        transactionId: tx.transactionId.toString(),
        sequenceNumber: Number(receipt.topicSequenceNumber ?? 0),
        consensusTimestamp: record.consensusTimestamp?.toDate()?.toISOString(),
      };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "unknown" };
    }
  }
}