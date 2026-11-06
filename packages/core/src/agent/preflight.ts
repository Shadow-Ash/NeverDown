import { readFileSync, statSync } from "node:fs";
import { liveSeedSpec } from "../arkiv/seed.js";

const FORBIDDEN_PARENT_KEYS = ["HEDERA_SPEND_KEY", "HEDERA_OPERATOR_KEY", "ARKIV_PRIVATE_KEY", "RECLAIM_PRIVATE_KEY"];
const WORKER_REQUIRED_KEYS = ["HEDERA_SPEND_ID", "HEDERA_SPEND_KEY", "HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY", "HEDERA_TOPIC_ID", "POLICY_ALLOWLIST", "POLICY_ENDPOINTS", "POLICY_MAX_PER_PAYMENT_TINYBARS", "POLICY_TOTAL_BUDGET_TINYBARS", "POLICY_DB_PATH"];

function parseEnvFile(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
  }
  return result;
}

/** Static, read-only checks. Returns names and reasons, never secret values. */
export function inspectLiveConfiguration(env: NodeJS.ProcessEnv = process.env): string[] {
  const issues: string[] = [];
  for (const key of FORBIDDEN_PARENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) issues.push(`${key} must be absent from the agent environment`);
  }
  for (const key of ["ENS_RPC_URL", "ENS_ALLOWLIST_NAMES", "POC_REFERENCE_RPC", "ARKIV_ACCESS_KEY", "PAYMENT_WORKER_ENV_FILE"]) {
    if (!env[key]?.trim()) issues.push(`${key} is required`);
  }
  if (env.POC_REFERENCE_RPC?.trim() && env.RPC_UPSTREAM_URL?.trim() && env.POC_REFERENCE_RPC.trim() === env.RPC_UPSTREAM_URL.trim()) {
    issues.push("POC_REFERENCE_RPC must be independent of RPC_UPSTREAM_URL");
  }
  if (env.GATEWAY_INTERNAL_API !== "true") issues.push("GATEWAY_INTERNAL_API must be true");
  if ((env.GATEWAY_INTERNAL_TOKEN?.trim().length ?? 0) < 20) issues.push("GATEWAY_INTERNAL_TOKEN must be at least 20 characters");
  const primary = env.GATEWAY_PRIMARY_RPC_URL?.trim() || env.GATEWAY_PRIMARY_RPC?.trim();
  const standby = env.GATEWAY_STANDBY_RPC_URL?.trim() || env.GATEWAY_STANDBY_RPC?.trim();
  if (!primary || !standby || primary === standby) issues.push("GATEWAY_PRIMARY_RPC_URL and GATEWAY_STANDBY_RPC_URL must be distinct");

  let spec: ReturnType<typeof liveSeedSpec> | undefined;
  try { spec = liveSeedSpec(env); } catch (e) { issues.push(e instanceof Error ? e.message : "seller offer configuration invalid"); }
  if (spec && !(env.ENS_ALLOWLIST_NAMES ?? "").split(/[,\s;]+/).some((name) => name.toLowerCase() === spec.sellerens)) {
    issues.push("SELLER_ENS_NAME must be in ENS_ALLOWLIST_NAMES");
  }

  const file = env.PAYMENT_WORKER_ENV_FILE?.trim();
  if (file) {
    try {
      const mode = statSync(file).mode;
      if (process.platform !== "win32" && (mode & 0o077) !== 0) issues.push("PAYMENT_WORKER_ENV_FILE must have mode 0600");
      const worker = parseEnvFile(readFileSync(file, "utf8"));
      for (const key of WORKER_REQUIRED_KEYS) if (!worker[key]?.trim()) issues.push(`worker ${key} is required`);
      if (worker.HCS_AUDIT_AVAILABILITY && worker.HCS_AUDIT_AVAILABILITY !== "REQUIRED_DURABLE") issues.push("worker HCS_AUDIT_AVAILABILITY must be REQUIRED_DURABLE for live acceptance");
      if (worker.POLICY_DB_PATH === ":memory:") issues.push("worker POLICY_DB_PATH must be persistent");
      if (spec) {
        if (!(worker.POLICY_ALLOWLIST ?? "").split(/[,\s;]+/).includes(spec.payto)) issues.push("worker POLICY_ALLOWLIST must include seller payTo");
        if (!(worker.POLICY_ENDPOINTS ?? "").split(/[,\s;]+/).includes(spec.serviceurl)) issues.push("worker POLICY_ENDPOINTS must include seller base URL");
        for (const key of ["POLICY_MAX_PER_PAYMENT_TINYBARS", "POLICY_TOTAL_BUDGET_TINYBARS"]) {
          const raw = worker[key] || "";
          if (!/^\d+$/.test(raw) || BigInt(raw) < spec.pricetinybars) issues.push(`worker ${key} must cover one selected offer`);
        }
      }
    } catch { issues.push("PAYMENT_WORKER_ENV_FILE cannot be read"); }
  }
  return issues;
}

export async function checkRpcChainId(url: string, expectedHex: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("RPC chain check unavailable");
  const payload = await response.json() as { result?: unknown };
  if (payload.result !== expectedHex) throw new Error("RPC answered on wrong chain");
}
