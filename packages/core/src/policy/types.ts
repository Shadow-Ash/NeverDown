export type JsonPayload = Record<string, unknown>;

export type Currency = "HBAR" | "USDC" | "HBAR-tinybars";

export type PolicyConfig = {
  policyId: string;
  version: number;
  network: "hedera:testnet";
  scheme: "exact";
  asset: "0.0.0" | (string & {});
  allowedRecipients: readonly string[];
  allowedServiceIds: readonly string[];
  allowedEnsNames?: readonly string[];
  maxPerPaymentTinybars: bigint;
  totalBudgetTinybars: bigint;
  currency: Currency;
  expiresAt: string;
  buyerAccount: string;
  environment: "demo" | "testnet";
};

export type BudgetReservationState =
  | "REQUESTED"
  | "RESERVED"
  | "DENIED"
  | "SETTLED"
  | "RELEASED"
  | "UNCERTAIN";

export type EvidenceEventType =
  | "PURCHASE_REQUESTED"
  | "PURCHASE_DENIED"
  | "PURCHASE_AUTHORIZED"
  | "PAYMENT_SETTLED"
  | "PAYMENT_FAILED"
  | "PAYMENT_UNCERTAIN"
  | "BUDGET_RELEASED";

export type AuthorizationRecord = {
  purchaseId: string;
  policyId: string;
  policyVersion: number;
  buyerAccount: string;
  sellerPayTo: string;
  amountTinybars: bigint;
  network: string;
  asset: string;
  scheme: string;
  selectedRequirementHash: string;
  serviceId: string;
  endpoint: string;
  authorizedAt: string;
  x402PaymentRequiredHash: string;
  idempotencyKey: string;
};

export type PolicyDecision =
  | { approved: true; authorization: AuthorizationRecord }
  | { approved: false; denyReason: DenyReasonCode; message: string; authorization?: never };

export type DenyReasonCode =
  | "INVALID_CHALLENGE"
  | "INVALID_VERSION"
  | "NETWORK_MISMATCH"
  | "SCHEME_MISMATCH"
  | "ASSET_MISMATCH"
  | "RECIPIENT_NOT_ALLOWLISTED"
  | "OVER_PER_PAYMENT_CAP"
  | "BUDGET_EXCEEDED"
  | "SERVICE_NOT_ALLOWED"
  | "POLICY_EXPIRED"
  | "INVALID_AMOUNT"
  | "DUPLICATE_PURCHASE_ID"
  | "POLICY_VIOLATION"
  | "ENS_NOT_ALLOWLISTED";