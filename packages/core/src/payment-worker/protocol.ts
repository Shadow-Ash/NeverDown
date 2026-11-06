import type { PurchaseOutcome } from "../policy/types.js";

export class PaymentWorkerError extends Error {
  readonly code: string;
  constructor(message: string, code = "INVALID_REQUEST") {
    super(message);
    this.name = "PaymentWorkerError";
    this.code = code;
  }
}

const PURCHASE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const SERVICE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const TOKEN = /^[0-9a-f]{32,64}$/;

export type PurchaseRequest = {
  purchaseId: string;
  serviceId: string;
  endpoint: string;
};

export type PurchaseResultMessage = {
  type: "result";
  requestId: string;
  outcome: PurchaseOutcome;
};

export type PurchaseErrorMessage = {
  type: "error";
  requestId: string;
  code: string;
  message: string;
};

export type WorkerHelloMessage = { type: "hello"; token: string };
export type WorkerReadyMessage = { type: "ready" };
export type WorkerPurchaseMessage = { type: "purchase"; requestId: string; token: string; request: PurchaseRequest };
export type WorkerResultMessage = PurchaseResultMessage;
export type WorkerErrorMessage = PurchaseErrorMessage;

export type WorkerMessage =
  | WorkerHelloMessage
  | WorkerReadyMessage
  | WorkerPurchaseMessage
  | WorkerResultMessage
  | WorkerErrorMessage;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeEndpoint(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password || url.search || url.hash) return undefined;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function parsePurchaseRequest(value: unknown): PurchaseRequest {
  if (!isRecord(value)) throw new PaymentWorkerError("request must be an object", "INVALID_REQUEST");
  const extra = Object.keys(value).filter((k) => !["purchaseId", "serviceId", "endpoint"].includes(k));
  if (extra.length) throw new PaymentWorkerError("unexpected request fields", "INVALID_REQUEST");
  const purchaseId = value.purchaseId;
  const serviceId = value.serviceId;
  const endpoint = value.endpoint;
  if (typeof purchaseId !== "string" || !PURCHASE_ID.test(purchaseId)) throw new PaymentWorkerError("invalid purchaseId", "INVALID_PURCHASE_ID");
  if (typeof serviceId !== "string" || !SERVICE_ID.test(serviceId)) throw new PaymentWorkerError("invalid serviceId", "INVALID_SERVICE_ID");
  if (typeof endpoint !== "string") throw new PaymentWorkerError("invalid endpoint", "INVALID_ENDPOINT");
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized) throw new PaymentWorkerError("invalid endpoint", "INVALID_ENDPOINT");
  return { purchaseId, serviceId, endpoint: normalized };
}

export function parseWorkerRequestMessage(value: unknown): { requestId: string; token: string; request: PurchaseRequest } {
  if (!isRecord(value)) throw new PaymentWorkerError("message must be an object", "INVALID_REQUEST");
  const extra = Object.keys(value).filter((k) => !["type", "requestId", "token", "request"].includes(k));
  if (extra.length) throw new PaymentWorkerError("unexpected message fields", "INVALID_REQUEST");
  if (value.type !== "purchase") throw new PaymentWorkerError("expected purchase message", "INVALID_REQUEST");
  const requestId = value.requestId;
  const token = value.token;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) throw new PaymentWorkerError("invalid requestId", "INVALID_REQUEST");
  if (typeof token !== "string" || !TOKEN.test(token)) throw new PaymentWorkerError("invalid caller token", "UNAUTHORIZED");
  const request = parsePurchaseRequest(value.request);
  return { requestId, token, request };
}

export function parseHelloMessage(value: unknown): string {
  if (!isRecord(value)) throw new PaymentWorkerError("message must be an object", "INVALID_REQUEST");
  const extra = Object.keys(value).filter((k) => !["type", "token"].includes(k));
  if (extra.length) throw new PaymentWorkerError("unexpected message fields", "INVALID_REQUEST");
  if (value.type !== "hello") throw new PaymentWorkerError("expected hello", "INVALID_REQUEST");
  const token = value.token;
  if (typeof token !== "string" || !TOKEN.test(token)) throw new PaymentWorkerError("invalid hello token", "UNAUTHORIZED");
  return token;
}
