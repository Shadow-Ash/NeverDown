export type DenyReason = "OFF_ALLOWLIST" | "OVER_CAP" | "PAYTO_MISMATCH";

export type AuditEventBase = {
  v: 1;
  sellerId: string;
  payTo: string;
  amountTinybars: string;
  policyVersion: string;
  ts: string;
};

export type PayAuditEvent = AuditEventBase & {
  type: "PAY";
  txId: string;
};

export type DenyAuditEvent = AuditEventBase & {
  type: "DENY";
  reason: DenyReason;
};

export type AuditEvent = PayAuditEvent | DenyAuditEvent;

export type HederaOperator = {
  accountId: string;
  privateKey: string;
  network?: "testnet";
};
