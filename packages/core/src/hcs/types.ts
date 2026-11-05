export type HcsAuditAvailability = "REQUIRED_DURABLE" | "BEST_EFFORT";
export type HcsEvent = {
  eventId: string;
  purchaseId: string;
  policyId?: string;
  policyVersion?: number;
  eventType: string;
  occurredAt: string;
  buyerAccountReference: string;
  sellerPayTo: string;
  network: string;
  asset: string;
  amountTinybars: string;
  reasonCode: string;
  requirementHash: string;
  evidenceHash: string;
  previousEventHash?: string | null;
  settlementTransactionId?: string;
  schemaVersion: "nd-audit-v1";
};

export type HcsPublishResult = {
  status: "disabled" | "published" | "failed";
  transactionId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  error?: string;
};

export type HcsVerificationResult = {
  status: "PENDING" | "VERIFIED" | "MISMATCH" | "NOT_FOUND";
  eventId: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  transactionId?: string;
  mirrorNodeUrl?: string;
  message?: string;
};