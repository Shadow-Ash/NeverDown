export type JsonRpcSuccess = { jsonrpc: "2.0"; id: number; result: unknown };
export type JsonRpcFailure = { jsonrpc: "2.0"; id: number; error: { message?: string } };

export async function jsonRpcCall(
  url: string,
  method: string,
  params: unknown[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<{ result: unknown; latencyMs: number }> {
  const started = Date.now();
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status} for ${method}`);
  }
  const body = (await res.json()) as JsonRpcSuccess | JsonRpcFailure;
  if ("error" in body && body.error) {
    throw new Error(body.error.message ?? `RPC error for ${method}`);
  }
  return { result: (body as JsonRpcSuccess).result, latencyMs };
}

export function parseHexQuantity(value: unknown): number {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`expected hex quantity, got ${String(value)}`);
  }
  return Number.parseInt(value, 16);
}

export function normalizeChainId(value: number | string): string {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) throw new Error("invalid expectedChainId");
    return `0x${value.toString(16)}`;
  }
  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return `0x${Number.parseInt(trimmed, 10).toString(16)}`;
  if (/^0x[0-9a-f]+$/.test(trimmed)) return trimmed;
  throw new Error(`invalid expectedChainId: ${value}`);
}
