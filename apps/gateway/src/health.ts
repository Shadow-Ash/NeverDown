export type ProviderHealth = {
  id: string;
  url: string;
  healthy: boolean;
  lastCheckAt: number;
  chainId: number | null;
  blockNumber: number | null;
  latencyMs: number | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  reason: string | null;
  lastError: string | null;
  readonly referenceBlock: number | null;
};

export type ProbeResult = {
  healthy: boolean;
  latencyMs: number | null;
  chainId: number | null;
  blockNumber: number | null;
  reason: string | null;
  error: string | null;
};

function safeJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function rpcFetch(url: string, method: string, params: unknown[], timeoutMs: number, entitlementToken?: string): Promise<unknown> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(entitlementToken ? { authorization: `Bearer ${entitlementToken}` } : {}) },
      body,
      signal: controller.signal,
      redirect: "error",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return safeJsonText(text);
  } finally {
    clearTimeout(timer);
    void start;
  }
}

export async function probeRpcProvider(
  url: string,
  expectedChainId: number,
  timeoutMs: number,
  referenceBlock: number | null,
  staleTolerance: number,
  entitlementToken?: string,
): Promise<ProbeResult> {
  const t0 = Date.now();
  const latency = () => Date.now() - t0;

  try {
    const chainInfo = (await Promise.race([
      rpcFetch(url, "eth_chainId", [], timeoutMs, entitlementToken),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ])) as { result?: unknown } | undefined;

    if (!chainInfo || typeof chainInfo !== "object" || !("result" in chainInfo)) {
      return { healthy: false, latencyMs: latency(), chainId: null, blockNumber: null, reason: "invalid eth_chainId response", error: "invalid eth_chainId response" };
    }

    const chainIdRaw = (chainInfo as { result?: unknown }).result;
    const chainId = typeof chainIdRaw === "string" ? Number(chainIdRaw) : NaN;
    if (!Number.isFinite(chainId) || chainId !== expectedChainId) {
      return { healthy: false, latencyMs: latency(), chainId: Number.isFinite(chainId) ? chainId : null, blockNumber: null, reason: "chain id mismatch", error: "chain id mismatch" };
    }

    const blockInfo = (await Promise.race([
      rpcFetch(url, "eth_blockNumber", [], timeoutMs, entitlementToken),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ])) as { result?: unknown } | undefined;

    if (!blockInfo || typeof blockInfo !== "object" || !("result" in blockInfo)) {
      return { healthy: false, latencyMs: latency(), chainId, blockNumber: null, reason: "invalid eth_blockNumber response", error: "invalid eth_blockNumber response" };
    }

    const blockRaw = (blockInfo as { result?: unknown }).result;
    if (typeof blockRaw !== "string" || !/^0x[0-9a-fA-F]+$/.test(blockRaw)) {
      return { healthy: false, latencyMs: latency(), chainId, blockNumber: null, reason: "invalid block number hex", error: "invalid block number hex" };
    }

    const blockNumber = parseInt(blockRaw, 16);
    if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) {
      return { healthy: false, latencyMs: latency(), chainId, blockNumber: null, reason: "invalid block number", error: "invalid block number" };
    }

    if (referenceBlock !== null) {
      const floor = referenceBlock - staleTolerance;
      if (blockNumber < floor) {
        return { healthy: false, latencyMs: latency(), chainId, blockNumber, reason: `stale block: ${blockNumber} < ${floor}`, error: "stale block" };
      }
    }

    return { healthy: true, latencyMs: latency(), chainId, blockNumber, reason: "ok", error: null };
  } catch (err) {
    return { healthy: false, latencyMs: latency(), chainId: null, blockNumber: null, reason: "rpc timeout or network error", error: err instanceof Error ? err.name : "unknown error" };
  }
}

export { rpcFetch as _probeRpcFetchInternal };
