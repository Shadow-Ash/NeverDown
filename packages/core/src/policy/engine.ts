import {
  submitAuditMessage,
  type AuditEvent,
  type DenyReason,
  type HederaOperator,
  type SubmitAuditResult,
} from "../hcs/index.js";
import {
  payForRpcOnceWithConfig,
  type BuyerConfig,
  type JsonRpcRequest,
  type PayForRpcOnceResult,
} from "../x402/index.js";
import type { AllowlistEntry, PolicyState } from "./config.js";

export type AuthorizePurchaseInput = {
  sellerId: string;
  payTo: string;
  amountTinybars: bigint | number | string;
  sellerUrl?: string;
  rpc?: JsonRpcRequest;
};

export type AuthorizeDenied = {
  ok: false;
  reason: DenyReason;
  hcs?: SubmitAuditResult;
  event: AuditEvent;
};

export type AuthorizePaid = {
  ok: true;
  payment: PayForRpcOnceResult;
  hcs: SubmitAuditResult;
  event: AuditEvent;
  spentTinybars: bigint;
};

export type AuthorizePurchaseResult = AuthorizeDenied | AuthorizePaid;

export type PolicyEngineDeps = {
  state: PolicyState;
  buyer: BuyerConfig;
  operator: HederaOperator;
  topicId: string;
  /** Injected for hermetic tests — default posts to Hedera. */
  submitAudit?: (event: AuditEvent) => Promise<SubmitAuditResult>;
  /** Injected for hermetic tests — default runs live x402 pay. */
  pay?: (args: {
    buyer: BuyerConfig;
    sellerUrl: string;
    rpc?: JsonRpcRequest;
  }) => Promise<PayForRpcOnceResult>;
};

function toAmount(amount: bigint | number | string): bigint {
  if (typeof amount === "bigint") return amount;
  if (typeof amount === "number") {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error("amountTinybars must be a non-negative integer");
    }
    return BigInt(amount);
  }
  if (!/^\d+$/.test(amount.trim())) {
    throw new Error("amountTinybars must be a non-negative integer string");
  }
  return BigInt(amount.trim());
}

function findAllowlistEntry(allowlist: AllowlistEntry[], sellerId: string): AllowlistEntry | undefined {
  return allowlist.find((e) => e.sellerId === sellerId);
}

/**
 * Server-side spend gate. Deny paths never call x402 / never touch the spend key for signing.
 * Spend credentials live only on `deps.buyer` and are used solely inside the approve → pay path.
 */
export class PolicyEngine {
  private state: PolicyState;
  private readonly buyer: BuyerConfig;
  private readonly operator: HederaOperator;
  private readonly topicId: string;
  private readonly submitAudit: (event: AuditEvent) => Promise<SubmitAuditResult>;
  private readonly pay: PolicyEngineDeps["pay"];

  constructor(deps: PolicyEngineDeps) {
    this.state = {
      ...deps.state,
      allowlist: deps.state.allowlist.map((e) => ({ ...e })),
    };
    this.buyer = deps.buyer;
    this.operator = deps.operator;
    this.topicId = deps.topicId;
    this.submitAudit =
      deps.submitAudit ??
      ((event) =>
        submitAuditMessage({
          topicId: this.topicId,
          operator: this.operator,
          event,
        }));
    this.pay =
      deps.pay ??
      (async ({ buyer, sellerUrl, rpc }) =>
        payForRpcOnceWithConfig({ ...buyer, sellerUrl }, { rpc }));
  }

  getState(): PolicyState {
    return {
      ...this.state,
      allowlist: this.state.allowlist.map((e) => ({ ...e })),
    };
  }

  async authorizePurchase(input: AuthorizePurchaseInput): Promise<AuthorizePurchaseResult> {
    const amountTinybars = toAmount(input.amountTinybars);
    const sellerUrl = input.sellerUrl ?? this.buyer.sellerUrl;
    const base = {
      v: 1 as const,
      sellerId: input.sellerId,
      payTo: input.payTo,
      amountTinybars: amountTinybars.toString(),
      policyVersion: this.state.policyVersion,
      ts: new Date().toISOString(),
    };

    const entry = findAllowlistEntry(this.state.allowlist, input.sellerId);
    if (!entry) {
      return this.deny({ ...base, type: "DENY", reason: "OFF_ALLOWLIST" });
    }
    if (entry.payTo !== input.payTo) {
      return this.deny({ ...base, type: "DENY", reason: "PAYTO_MISMATCH" });
    }
    if (this.state.spentTinybars + amountTinybars > this.state.capTinybars) {
      return this.deny({ ...base, type: "DENY", reason: "OVER_CAP" });
    }

    // Approve path — only place that may use spend credentials.
    const payment = await this.pay!({
      buyer: this.buyer,
      sellerUrl,
      rpc: input.rpc,
    });

    this.state.spentTinybars += amountTinybars;
    const event: AuditEvent = {
      ...base,
      type: "PAY",
      txId: payment.transactionId,
    };
    const hcs = await this.submitAudit(event);
    return {
      ok: true,
      payment,
      hcs,
      event,
      spentTinybars: this.state.spentTinybars,
    };
  }

  private async deny(
    event: Extract<AuditEvent, { type: "DENY" }>,
  ): Promise<AuthorizeDenied> {
    const hcs = await this.submitAudit(event);
    return { ok: false, reason: event.reason, hcs, event };
  }
}
