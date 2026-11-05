import {
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import { createOperatorClient } from "./client.js";
import type { AuditEvent, HederaOperator } from "./types.js";

export class HcsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HcsError";
  }
}

/** Create a new HCS topic owned by the operator. Returns topic id `0.0.N`. */
export async function createAuditTopic(operator: HederaOperator): Promise<string> {
  const client = createOperatorClient(operator);
  try {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo("NeverDown C3 PAY/DENY audit")
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId;
    if (!topicId) {
      throw new HcsError("TopicCreateTransaction succeeded but receipt.topicId is missing");
    }
    return topicId.toString();
  } finally {
    client.close();
  }
}

export type SubmitAuditInput = {
  topicId: string;
  operator: HederaOperator;
  event: AuditEvent;
};

export type SubmitAuditResult = {
  transactionId: string;
  sequenceNumber?: number;
};

/** Submit a PAY or DENY JSON audit event to the topic. */
export async function submitAuditMessage(input: SubmitAuditInput): Promise<SubmitAuditResult> {
  const client = createOperatorClient(input.operator);
  try {
    const payload = Buffer.from(JSON.stringify(input.event), "utf8");
    if (payload.byteLength > 1024) {
      throw new HcsError(`Audit payload exceeds 1024 bytes (${payload.byteLength})`);
    }
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(input.topicId))
      .setMessage(payload)
      .execute(client);
    const record = await tx.getRecord(client);
    const sequenceNumber = record.receipt.topicSequenceNumber?.toNumber();
    return {
      transactionId: tx.transactionId.toString(),
      sequenceNumber,
    };
  } finally {
    client.close();
  }
}
