import type { HederaOperator } from "../hcs/types.js";
import { BuyerConfigError, loadBuyerConfig, type BuyerConfig } from "../x402/config.js";

const HEDERA_ACCOUNT_ID = /^0\.0\.[1-9]\d*$/;

export class PolicyConfigError extends Error {
  readonly envVar?: string;

  constructor(message: string, envVar?: string) {
    super(message);
    this.name = "PolicyConfigError";
    this.envVar = envVar;
  }
}

export type AllowlistEntry = {
  sellerId: string;
  payTo: string;
};

export type PolicyState = {
  policyVersion: string;
  capTinybars: bigint;
  spentTinybars: bigint;
  allowlist: AllowlistEntry[];
};

export type PolicyRuntimeConfig = {
  state: PolicyState;
  buyer: BuyerConfig;
  operator: HederaOperator;
  topicId: string;
};

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new PolicyConfigError(`Missing required environment variable: ${name}`, name);
  }
  return value;
}

/**
 * Parse `POLICY_ALLOWLIST` as comma-separated `sellerId:payTo` pairs.
 * Example: `neverdown-rpc:0.0.11326899`
 */
export function parseAllowlist(raw: string): AllowlistEntry[] {
  const entries: AllowlistEntry[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0 || colon === trimmed.length - 1) {
      throw new PolicyConfigError(
        "POLICY_ALLOWLIST entries must be sellerId:payTo (e.g. neverdown-rpc:0.0.123)",
        "POLICY_ALLOWLIST",
      );
    }
    const sellerId = trimmed.slice(0, colon).trim();
    const payTo = trimmed.slice(colon + 1).trim();
    if (!sellerId || !HEDERA_ACCOUNT_ID.test(payTo)) {
      throw new PolicyConfigError(
        "POLICY_ALLOWLIST payTo must look like 0.0.12345",
        "POLICY_ALLOWLIST",
      );
    }
    entries.push({ sellerId, payTo });
  }
  if (entries.length === 0) {
    throw new PolicyConfigError("POLICY_ALLOWLIST must include at least one entry", "POLICY_ALLOWLIST");
  }
  return entries;
}

export function loadPolicyState(env: NodeJS.ProcessEnv = process.env): PolicyState {
  const capRaw = env.POLICY_CAP_TINYBARS?.trim() || "50000";
  if (!/^[1-9]\d*$/.test(capRaw)) {
    throw new PolicyConfigError(
      "POLICY_CAP_TINYBARS must be a positive integer",
      "POLICY_CAP_TINYBARS",
    );
  }
  const spentRaw = env.POLICY_SPENT_TINYBARS?.trim() || "0";
  if (!/^\d+$/.test(spentRaw)) {
    throw new PolicyConfigError(
      "POLICY_SPENT_TINYBARS must be a non-negative integer",
      "POLICY_SPENT_TINYBARS",
    );
  }
  const allowlistRaw = requireValue(env, "POLICY_ALLOWLIST");
  return {
    policyVersion: env.POLICY_VERSION?.trim() || "c3-v1",
    capTinybars: BigInt(capRaw),
    spentTinybars: BigInt(spentRaw),
    allowlist: parseAllowlist(allowlistRaw),
  };
}

export function loadPolicyRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PolicyRuntimeConfig {
  let buyer: BuyerConfig;
  try {
    buyer = loadBuyerConfig(env);
  } catch (err) {
    if (err instanceof BuyerConfigError) {
      throw new PolicyConfigError(err.message, err.envVar);
    }
    throw err;
  }

  const operatorId = requireValue(env, "HEDERA_OPERATOR_ID");
  if (!HEDERA_ACCOUNT_ID.test(operatorId)) {
    throw new PolicyConfigError(
      "HEDERA_OPERATOR_ID must look like 0.0.12345",
      "HEDERA_OPERATOR_ID",
    );
  }
  const operatorKey = requireValue(env, "HEDERA_OPERATOR_KEY");
  const topicId = requireValue(env, "HEDERA_TOPIC_ID");
  if (!HEDERA_ACCOUNT_ID.test(topicId)) {
    throw new PolicyConfigError("HEDERA_TOPIC_ID must look like 0.0.12345", "HEDERA_TOPIC_ID");
  }

  return {
    state: loadPolicyState(env),
    buyer,
    operator: { accountId: operatorId, privateKey: operatorKey, network: "testnet" },
    topicId,
  };
}
