import type { x402HTTPClient } from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import { createHederaX402HttpClient } from "./client.js";
import type { BuyerConfig } from "./config.js";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown[];
};

export type PayForRpcOnceInput = {
  sellerUrl: string;
  /** Defaults to eth_blockNumber */
  rpc?: JsonRpcRequest;
  httpClient: x402HTTPClient;
  fetchImpl?: typeof fetch;
};

export type PayForRpcOnceResult = {
  rpcResult: unknown;
  transactionId: string;
  hashscanUrl: string;
  settle: SettleResponse;
  httpStatus: number;
};

export class PayOnceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayOnceError";
  }
}

export function hashscanTestnetUrl(transactionId: string): string {
  return `https://hashscan.io/testnet/transaction/${encodeURIComponent(transactionId)}`;
}

const DEFAULT_RPC: JsonRpcRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "eth_blockNumber",
  params: [],
};

function headerGetter(headers: Headers): (name: string) => string | null {
  return (name: string) => headers.get(name);
}

/**
 * Unpaid POST /rpc → 402 → sign → paid POST /rpc → settlement metadata.
 */
export async function payForRpcOnce(input: PayForRpcOnceInput): Promise<PayForRpcOnceResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const rpc = input.rpc ?? DEFAULT_RPC;
  const url = `${input.sellerUrl.replace(/\/$/, "")}/rpc`;

  const unpaid = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(rpc),
  });

  if (unpaid.status !== 402) {
    const bodyText = await unpaid.text().catch(() => "");
    throw new PayOnceError(
      `Expected HTTP 402 Payment Required from ${url}, got ${unpaid.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
    );
  }

  let unpaidBody: unknown;
  try {
    unpaidBody = await unpaid.json();
  } catch {
    unpaidBody = undefined;
  }

  const paymentRequired = input.httpClient.getPaymentRequiredResponse(
    headerGetter(unpaid.headers),
    unpaidBody,
  );

  const paymentPayload = await input.httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = input.httpClient.encodePaymentSignatureHeader(paymentPayload);

  const paid = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...paymentHeaders,
    },
    body: JSON.stringify(rpc),
  });

  if (paid.status !== 200) {
    const bodyText = await paid.text().catch(() => "");
    throw new PayOnceError(
      `Paid request failed with HTTP ${paid.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`,
    );
  }

  const settle = input.httpClient.getPaymentSettleResponse(headerGetter(paid.headers));
  if (!settle.success) {
    throw new PayOnceError(
      `Settlement unsuccessful: ${settle.errorReason ?? settle.errorMessage ?? "unknown"}`,
    );
  }
  if (!settle.transaction?.trim()) {
    throw new PayOnceError("Settlement response missing Hedera transaction id");
  }

  const json = (await paid.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) {
    throw new PayOnceError(`JSON-RPC error after payment: ${json.error.message ?? "unknown"}`);
  }

  return {
    rpcResult: json.result,
    transactionId: settle.transaction,
    hashscanUrl: hashscanTestnetUrl(settle.transaction),
    settle,
    httpStatus: paid.status,
  };
}

/** Convenience: build client from buyer config and pay once. */
export async function payForRpcOnceWithConfig(
  config: BuyerConfig,
  opts: { rpc?: JsonRpcRequest; fetchImpl?: typeof fetch } = {},
): Promise<PayForRpcOnceResult> {
  const httpClient = createHederaX402HttpClient({
    accountId: config.spendAccountId,
    privateKey: config.spendPrivateKey,
    network: config.network,
  });
  return payForRpcOnce({
    sellerUrl: config.sellerUrl,
    httpClient,
    rpc: opts.rpc,
    fetchImpl: opts.fetchImpl,
  });
}
