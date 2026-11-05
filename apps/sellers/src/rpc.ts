export const SUPPORTED_METHODS = ["eth_chainId", "eth_blockNumber", "net_version"] as const;
export type SupportedMethod = (typeof SUPPORTED_METHODS)[number];

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: SupportedMethod;
  params: [];
}

export interface JsonRpcError {
  code: number;
  message: string;
}

export type ValidationResult =
  | { ok: true; request: JsonRpcRequest }
  | { ok: false; id: JsonRpcId; error: JsonRpcError };

export const MAX_UPSTREAM_RESPONSE_BYTES = 1_000_000;
export const UPSTREAM_TIMEOUT_MS = 10_000;

// Deterministic values for a local mock chain (31337 is the Hardhat/Anvil default).
// Not a real network; used only when RPC_MODE=mock.
const MOCK_CHAIN_ID_HEX = "0x7a69";
const MOCK_NET_VERSION = "31337";
const MOCK_BLOCK_NUMBER_HEX = "0x10";

function isSupported(method: string): method is SupportedMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(method);
}

export function validateJsonRpc(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      id: null,
      error: { code: -32600, message: "Invalid Request: a single JSON-RPC object is required" },
    };
  }
  const obj = body as Record<string, unknown>;
  const id: JsonRpcId =
    typeof obj.id === "string" || typeof obj.id === "number" || obj.id === null ? obj.id : null;

  if (obj.jsonrpc !== "2.0") {
    return { ok: false, id, error: { code: -32600, message: "Invalid Request: jsonrpc must be \"2.0\"" } };
  }
  if (!("id" in obj) || (typeof obj.id !== "string" && typeof obj.id !== "number" && obj.id !== null)) {
    return { ok: false, id: null, error: { code: -32600, message: "Invalid Request: id must be a string, number or null" } };
  }
  if (typeof obj.method !== "string") {
    return { ok: false, id, error: { code: -32600, message: "Invalid Request: method must be a string" } };
  }
  if (!isSupported(obj.method)) {
    return { ok: false, id, error: { code: -32601, message: "Method not found or not allowed" } };
  }
  if (obj.params !== undefined && !(Array.isArray(obj.params) && obj.params.length === 0)) {
    return { ok: false, id, error: { code: -32602, message: "Invalid params: this method takes no parameters" } };
  }

  return { ok: true, request: { jsonrpc: "2.0", id, method: obj.method, params: [] } };
}

export function mockResult(method: SupportedMethod): string {
  switch (method) {
    case "eth_chainId":
      return MOCK_CHAIN_ID_HEX;
    case "eth_blockNumber":
      return MOCK_BLOCK_NUMBER_HEX;
    case "net_version":
      return MOCK_NET_VERSION;
  }
}

export type UpstreamOutcome = { ok: true; result: unknown } | { ok: false; error: JsonRpcError };

// Sends only the validated fields to a fixed upstream URL. Never echoes upstream
// error bodies or payment headers back to the client.
export async function forwardToUpstream(
  url: string,
  request: JsonRpcRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<UpstreamOutcome> {
  const upstreamError = { code: -32603, message: "Upstream RPC unavailable" };
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: request.id, method: request.method, params: [] }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (err) {
    console.error("upstream call failed:", err instanceof Error ? err.name : "unknown error");
    return { ok: false, error: upstreamError };
  }
  if (!res.ok) {
    console.error("upstream returned HTTP", res.status);
    return { ok: false, error: upstreamError };
  }
  const text = await res.text();
  if (Buffer.byteLength(text, "utf8") > MAX_UPSTREAM_RESPONSE_BYTES) {
    console.error("upstream response too large");
    return { ok: false, error: upstreamError };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: upstreamError };
  }
  if (typeof parsed !== "object" || parsed === null || !("result" in parsed) || "error" in parsed) {
    return { ok: false, error: upstreamError };
  }
  return { ok: true, result: (parsed as { result: unknown }).result };
}
