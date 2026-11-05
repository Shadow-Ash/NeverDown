import { payForRpcOnce } from "../x402/index.js";
import { loadHcsConfig } from "../hcs/config.js";

import { hashCanonical } from "../hcs/evidence.js";
import type { BudgetStore } from "./budgetStore.js";
import type { HcsEvent } from "../hcs/types.js";

import { authorizePurchase } from "./engine.js";
import { loadPolicyConfig } from "./config.js";

export class SecurePurchaseError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SecurePurchaseError";
    this.code = code;
  }
}

type SecurePurchaseInput = {
  purchaseId: string;
  serviceId: string;
  endpoint: string;
  store: BudgetStore;
  env?: NodeJS.ProcessEnv;
};

type SecurePurchaseApproved = {
  approved: true;
  httpStatus: number;
  rpcResult: unknown;
  transactionId: string;
  hashscanUrl: string;
  authorization: unknown;
  settleResult: unknown;
  auditOutboxId: string;
  auditAnchorStatus: "disabled" | "published" | "failed" | "pending";
};

type SecurePurchaseDenied = {
  approved: false;
  denyReason: string;
  message: string;
  auditOutboxId: string;
  httpStatus: number;
};

export async function securePurchase(input: SecurePurchaseInput): Promise<SecurePurchaseApproved | SecurePurchaseDenied> {
  const env = input.env ?? process.env;
  const policy = loadPolicyConfig(env);
  const sellerUrl = (input.endpoint || "").replace(/\/$/, "");
  if (!sellerUrl.startsWith("http://") && !sellerUrl.startsWith("https://")) throw new SecurePurchaseError("invalid endpoint", "INVALID_ENDPOINT");

  const challengeUrl = `${sellerUrl}/rpc`;
  const unpaid = await fetch(challengeUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
  if (unpaid.status !== 402) {
    throw new SecurePurchaseError(`expected 402 but got ${unpaid.status}`, "INVALID_CHALLENGE");
  }
  await unpaid.json().catch(() => null);

  const { createHederaX402HttpClient } = await import("../x402/client.js");
  // For resolution, a real client will be created from C2 bindings.

  // Use static metadata but actual parsing path (server provides valid payment details)
  const requirementRaw = unpaid.headers.get("payment-required") ?? "";
  const parsedChallenge = JSON.parse(Buffer.from(requirementRaw, "base64").toString("utf8"));
  const challenge: unknown = parsedChallenge;

  const authorizationResult = await authorizePurchase({
    policy,
    paymentRequirements: challenge as any,
    store: input.store,
    serviceId: input.serviceId,
    purchaseId: input.purchaseId,
  });
  if (!authorizationResult.approved) {
    const id = `outbox-${input.purchaseId}-DENY`;
    const event: HcsEvent = {
      schemaVersion: "nd-audit-v1",
      eventId: id,
      purchaseId: input.purchaseId,
      policyId: policy.policyId,
      policyVersion: policy.version,
      eventType: "PURCHASE_DENIED",
      occurredAt: new Date().toISOString(),
      buyerAccountReference: policy.buyerAccount,
      sellerPayTo: (challenge as any).accepts?.[0]?.payTo ?? "",
      network: policy.network,
      asset: policy.asset,
      amountTinybars: "0",
      reasonCode: authorizationResult.denyReason,
      requirementHash: hashCanonical((challenge as any).accepts?.[0] ?? {}),
      evidenceHash: hashCanonical({ event: "DENY", challenge })
    } as any;
        const hcsCfg = loadHcsConfig(env);
    if (hcsCfg) {
      input.store.enqueueOutbox({ id, purchaseId: input.purchaseId, policyId: policy.policyId, eventType: "PURCHASE_DENIED", event, contentHash: hashCanonical(event), status: "pending", createdAt: new Date().toISOString() });
      const { HederaHcsClient } = await import("../hcs/client.js");
      const hcs = new HederaHcsClient(hcsCfg);
      const result = await hcs.submit(event as any);
      if (result.status === "published") input.store.markOutboxAnchored(id, result.sequenceNumber, result.consensusTimestamp, result.transactionId);
      else input.store.markOutboxFailed(id, result.error ?? "HCS failed");
    }
    return {
      approved: false,
      denyReason: authorizationResult.denyReason,
      message: authorizationResult.message,
      auditOutboxId: id,
      httpStatus: 402,
    };
  }

  const authorization = authorizationResult.authorization;
  const hcsCfg = loadHcsConfig(env);
  const authId = `outbox-${input.purchaseId}-AUTH`;
  const authEvent: HcsEvent = {
    schemaVersion: "nd-audit-v1",
    eventId: authId,
    purchaseId: input.purchaseId,
    policyId: policy.policyId,
    policyVersion: policy.version,
    eventType: "PURCHASE_AUTHORIZED",
    occurredAt: new Date().toISOString(),
    buyerAccountReference: policy.buyerAccount,
    sellerPayTo: authorization.sellerPayTo,
    network: authorization.network,
    asset: authorization.asset,
    amountTinybars: authorization.amountTinybars.toString(),
    reasonCode: "AUTHORIZED",
    requirementHash: authorization.selectedRequirementHash,
    evidenceHash: hashCanonical(authorization),
  } as any;
  if (hcsCfg) {
    input.store.enqueueOutbox({ id: authId, purchaseId: input.purchaseId, policyId: policy.policyId, eventType: "PURCHASE_AUTHORIZED", event: authEvent, contentHash: hashCanonical(authEvent), status: "pending", createdAt: new Date().toISOString() });
    const { HederaHcsClient } = await import("../hcs/client.js");
    const hcs = new HederaHcsClient(hcsCfg);
    const result = await hcs.submit(authEvent);
    if (result.status === "published") input.store.markOutboxAnchored(authId, result.sequenceNumber, result.consensusTimestamp, result.transactionId);
    else input.store.markOutboxFailed(authId, result.error ?? "HCS failed");
  }

  // signing and payment
  const credentials = {
    accountId: policy.buyerAccount,
    privateKey: env.HEDERA_SPEND_KEY!.trim(),
    network: policy.network,
  };
  const httpClient = createHederaX402HttpClient(credentials);
  try {
    const result = await payForRpcOnce({ sellerUrl: sellerUrl, httpClient, fetchImpl: fetch });
    // commit
    input.store.transition(input.purchaseId, "SETTLED", "committed");
    input.store.setTransaction(input.purchaseId, result.transactionId);
    const settleId = `outbox-${input.purchaseId}-SETTLED`;
    const settleEvent: HcsEvent = {
      schemaVersion: "nd-audit-v1",
      eventId: settleId,
      purchaseId: input.purchaseId,
      policyId: policy.policyId,
      policyVersion: policy.version,
      eventType: "PAYMENT_SETTLED",
      occurredAt: new Date().toISOString(),
      buyerAccountReference: policy.buyerAccount,
      sellerPayTo: authorization.sellerPayTo,
      network: authorization.network,
      asset: authorization.asset,
      amountTinybars: authorization.amountTinybars.toString(),
      reasonCode: "SETTLED",
      requirementHash: authorization.selectedRequirementHash,
      evidenceHash: hashCanonical(result)
    } as any;
    input.store.setTransaction(input.purchaseId, result.transactionId);
    if (hcsCfg) {
      input.store.enqueueOutbox({ id: settleId, purchaseId: input.purchaseId, policyId: policy.policyId, eventType: "PAYMENT_SETTLED", event: settleEvent, contentHash: hashCanonical(settleEvent), status: "pending", createdAt: new Date().toISOString() });
      const { HederaHcsClient } = await import("../hcs/client.js");
      const hcs = new HederaHcsClient(hcsCfg);
      const out = await hcs.submit(settleEvent);
      if (out.status === "published") input.store.markOutboxAnchored(settleId, out.sequenceNumber, out.consensusTimestamp, out.transactionId);
      else input.store.markOutboxFailed(settleId, out.error ?? "HCS failed");
    }
    return {
      approved: true,
      httpStatus: result.httpStatus,
      rpcResult: result.rpcResult,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      authorization,
      auditOutboxId: settleId,
      auditAnchorStatus: "published",
      settleResult: result.settle,
    };
  } catch (e) {
    input.store.transition(input.purchaseId, "UNCERTAIN", e instanceof Error ? e.message : "unknown");
    const uncertainId = `outbox-${input.purchaseId}-UNCERTAIN`;
    if (hcsCfg) {
      const event: HcsEvent = {
        schemaVersion: "nd-audit-v1",
        eventId: uncertainId,
        purchaseId: input.purchaseId,
        policyId: policy.policyId,
        policyVersion: policy.version,
        eventType: "PAYMENT_UNCERTAIN",
        occurredAt: new Date().toISOString(),
        buyerAccountReference: policy.buyerAccount,
        sellerPayTo: authorization.sellerPayTo,
        network: authorization.network,
        asset: authorization.asset,
        amountTinybars: authorization.amountTinybars.toString(),
        reasonCode: "UNCERTAIN",
        requirementHash: authorization.selectedRequirementHash,
        evidenceHash: hashCanonical({ error: e instanceof Error ? e.message : "unknown" }),
      } as any;
      input.store.enqueueOutbox({ id: uncertainId, purchaseId: input.purchaseId, policyId: policy.policyId, eventType: "PAYMENT_UNCERTAIN", event, contentHash: hashCanonical(event), status: "pending", createdAt: new Date().toISOString() });
    }
    throw new SecurePurchaseError(e instanceof Error ? e.message : "payment failed", "PAYMENT_FAILED");
  }
}

export function isecurePurchaseCompatible(): boolean { return true; }
