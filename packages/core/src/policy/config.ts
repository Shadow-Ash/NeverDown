import type { PolicyConfig } from "./types.js";
import { normalizeEndpoint } from "./endpoint.js";

export class PolicyConfigError extends Error {
  readonly envVar?: string;
  constructor(message: string, envVar?: string) {
    super(message);
    this.name = "PolicyConfigError";
    this.envVar = envVar;
  }
}

const HEDERA_ID = /^0\.0\.[1-9]\d*$/;
const TINYBARS = /^[0-9]+$/;


function parseBigInt(env: NodeJS.ProcessEnv, name: string, fallback?: string, required = false): bigint {
  const raw = (env[name]?.trim() || (required ? "" : (fallback?.trim() ?? "")));
  if (required && !raw) throw new PolicyConfigError(`Missing required environment variable: ${name}`, name);
  if (!TINYBARS.test(raw || "0")) throw new PolicyConfigError(`${name} must be a non-negative integer`, name);
  const value = BigInt(raw || "0");
  return value;
}

function split(env: NodeJS.ProcessEnv, name: string, fallback: string[] = []): string[] {
  const raw = env[name]?.trim();
  if (!raw) return [...fallback];
  return raw.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
}

export function loadPolicyConfig(env: NodeJS.ProcessEnv = process.env): PolicyConfig {
  const networkRaw = env.HEDERA_NETWORK?.trim() || "testnet";
  if (networkRaw !== "testnet" && networkRaw !== "hedera:testnet") {
    throw new PolicyConfigError("Only Hedera testnet policy is supported in C3", "HEDERA_NETWORK");
  }

  const policyId = env.POLICY_ID?.trim() || "neverdown-demo-v1";
  const versionRaw = env.POLICY_VERSION?.trim() || "1";
  const parsed = Number.parseInt(versionRaw, 10);
  const version = Number.isNaN(parsed) ? 1 : parsed;
  if (!Number.isFinite(version) || version <= 0) throw new PolicyConfigError("POLICY_VERSION must be positive", "POLICY_VERSION");

  const buyerAccount = env.HEDERA_SPEND_ID?.trim();
  if (!buyerAccount || !HEDERA_ID.test(buyerAccount)) throw new PolicyConfigError("HEDERA_SPEND_ID required", "HEDERA_SPEND_ID");

  const asset = env.HEDERA_X402_ASSET_ID?.trim() || "0.0.0";
  const recipients = split(env, "POLICY_ALLOWLIST", split(env, "NEVERDOWN_ALLOWLIST", [env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() || ""]));
  if (recipients.length === 0 || recipients.some((r) => !HEDERA_ID.test(r))) {
    throw new PolicyConfigError("POLICY_ALLOWLIST/HEDERA_MERCHANT_ACCOUNT_ID must contain valid Hedera account ids", "POLICY_ALLOWLIST");
  }

  const maxPerPayment = parseBigInt(env, "POLICY_MAX_PER_PAYMENT_TINYBARS", env.HEDERA_X402_PRICE_SMALLEST_UNITS || "10000", false);
  if (maxPerPayment <= 0n) throw new PolicyConfigError("max per payment > 0", "POLICY_MAX_PER_PAYMENT_TINYBARS");

  const capEnv = env.POLICY_CAP_TINYBARS?.trim() || env.POLICY_TOTAL_BUDGET_TINYBARS?.trim();
  const totalBudget = parseBigInt(
    env,
    "POLICY_TOTAL_BUDGET_TINYBARS",
    capEnv || env.POLICY_SPENT_TINYBARS || "30000",
    false,
  );
  if (totalBudget < maxPerPayment) throw new PolicyConfigError("budget must cover one payment", "POLICY_TOTAL_BUDGET_TINYBARS");

  const serviceRaw = env.POLICY_SERVICES?.trim() || "neverdown-rpc-pack";
  const allowedServiceIds = serviceRaw.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const allowedEnsNames = split(env, "ENS_ALLOWLIST_NAMES", []).map((x) => x.toLowerCase());

  const allowedEndpoints = split(env, "POLICY_ENDPOINTS", [env.SELLER_URL?.trim() || "http://localhost:4001"]).map((raw) => {
    const normalized = normalizeEndpoint(raw);
    if (!normalized) throw new PolicyConfigError("POLICY_ENDPOINTS must contain http(s) base URLs without credentials", "POLICY_ENDPOINTS");
    return normalized;
  });

  const ttlRaw = env.POLICY_AUTH_TTL_SECONDS?.trim() || "120";
  const authorizationTtlSeconds = Number(ttlRaw);
  if (!Number.isInteger(authorizationTtlSeconds) || authorizationTtlSeconds < 1 || authorizationTtlSeconds > 600) {
    throw new PolicyConfigError("POLICY_AUTH_TTL_SECONDS must be an integer between 1 and 600", "POLICY_AUTH_TTL_SECONDS");
  }

  const expiresAt = env.POLICY_EXPIRES_AT?.trim() || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (Number.isNaN(Date.parse(expiresAt))) throw new PolicyConfigError("POLICY_EXPIRES_AT invalid", "POLICY_EXPIRES_AT");

  return {
    policyId,
    version,
    network: "hedera:testnet",
    scheme: "exact",
    asset,
    allowedRecipients: recipients,
    allowedServiceIds,
    allowedEnsNames,
    allowedEndpoints,
    authorizationTtlSeconds,
    maxPerPaymentTinybars: maxPerPayment,
    totalBudgetTinybars: totalBudget,
    currency: "HBAR",
    expiresAt,
    buyerAccount,
    environment: "testnet",
  };
}