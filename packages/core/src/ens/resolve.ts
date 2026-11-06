import { JsonRpcProvider } from "ethers";

export type EnsTextRecords = {
  hederaAccount?: string;
  x402Url?: string;
  arkivOwner?: string;
  category?: string;
};

export type EnsSellerResolution = {
  ensName: string;
  normalizedEnsName: string;
  address: string | null;
  records: EnsTextRecords;
  resolverAddress: string | null;
};

export class EnsResolutionError extends Error {
  constructor(message: string, public code: "NOT_ALLOWLISTED" | "RESOLVE_FAILED" | "MISSING_RECORD" | "MATCH_FAILED", cause?: unknown) {
    super(message);
    this.name = "EnsResolutionError";
    if (cause) (this as Error & { cause?: unknown }).cause = cause;
  }
}

const DEFAULT_TEXT_KEYS = {
  hederaAccount: "hederaAccount",
  x402Url: "x402Url",
  arkivOwner: "arkivOwner",
  category: "category",
} as const;

function normalizeName(value: string): string | null {
  try {
    const name = value.trim().toLowerCase().replace(/\.$/, "");
    if (name && name.includes(".")) return name;
    return null;
  } catch {
    return null;
  }
}

export function createEnsProvider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl);
}

function applyOptionalTextOverlay(records: EnsTextRecords, env: NodeJS.ProcessEnv = process.env): EnsTextRecords {
  // Local rehearsal only: fill missing on-chain texts when explicitly enabled.
  // Judges / submission runs should set real ENS texts and leave ENS_ALLOW_TEXT_OVERLAY unset.
  if (env.ENS_ALLOW_TEXT_OVERLAY?.trim() !== "true") return records;
  return {
    ...records,
    hederaAccount: records.hederaAccount || env.ENS_TEXT_hederaAccount?.trim() || undefined,
    x402Url: records.x402Url || env.ENS_TEXT_x402Url?.trim() || undefined,
    arkivOwner: records.arkivOwner || env.ENS_TEXT_arkivOwner?.trim() || undefined,
    category: records.category || env.ENS_TEXT_category?.trim() || undefined,
  };
}

export async function resolveEnsSeller(name: string, rpcUrlOrProvider: string | JsonRpcProvider): Promise<EnsSellerResolution> {
  const provider = typeof rpcUrlOrProvider === "string" ? new JsonRpcProvider(rpcUrlOrProvider) : rpcUrlOrProvider;

  const normalized = normalizeName(name);
  if (!normalized) throw new EnsResolutionError("invalid ENS name", "RESOLVE_FAILED");

  const rawResolver = await provider.getResolver(normalized);
  if (!rawResolver) throw new EnsResolutionError(`No ENS resolver for ${name}`, "RESOLVE_FAILED");
  const resolver = rawResolver as unknown as { getText(key: string): Promise<string | null>; getAddress(): Promise<string | null>; };
  const records: EnsTextRecords = {};
  try {
    records.hederaAccount = (await resolver.getText(DEFAULT_TEXT_KEYS.hederaAccount)) ?? undefined;
    records.x402Url = (await resolver.getText(DEFAULT_TEXT_KEYS.x402Url)) ?? undefined;
    records.arkivOwner = (await resolver.getText(DEFAULT_TEXT_KEYS.arkivOwner)) ?? undefined;
    records.category = (await resolver.getText(DEFAULT_TEXT_KEYS.category)) ?? undefined;
  } catch (e) {
    throw new EnsResolutionError(`text record lookup failed for ${name}`, "RESOLVE_FAILED", e);
  }

  let address: string | null = null;
  try {
    address = (await resolver.getAddress()) ?? null;
  } catch {
    address = null;
  }

  return {
    ensName: name,
    normalizedEnsName: normalized,
    address,
    records: applyOptionalTextOverlay(records),
    resolverAddress: null,
  };
}

export function requireEnsAllowed(ensName: string, allowedNames: readonly string[]): void {
  const candidate = ensName.trim().toLowerCase();
  if (allowedNames.length === 0) throw new EnsResolutionError("ENS allowlist empty (fail closed)", "NOT_ALLOWLISTED");
  if (!allowedNames.map((x) => x.trim().toLowerCase()).includes(candidate)) {
    throw new EnsResolutionError(`${candidate} is not in the policy ENS allowlist`, "NOT_ALLOWLISTED");
  }
}

export function validateResolvedSeller(
  resolution: EnsSellerResolution,
  expectedPayTo: string,
  allowedNames?: readonly string[],
): void {
  if (allowedNames && allowedNames.length > 0) requireEnsAllowed(resolution.normalizedEnsName, allowedNames);
  if (!resolution.records.hederaAccount) throw new EnsResolutionError(`${resolution.ensName} missing hederaAccount record`, "MISSING_RECORD");
  if (resolution.records.hederaAccount.trim() !== expectedPayTo.trim()) {
    throw new EnsResolutionError(`${resolution.ensName} payTo mismatch`, "MATCH_FAILED");
  }
}

export async function resolveAndValidateEnsSeller(
  ensName: string,
  expectedPayTo: string,
  rpcUrlOrProvider: string | JsonRpcProvider,
  allowedNames?: readonly string[],
): Promise<EnsSellerResolution> {
  if (allowedNames && allowedNames.length > 0) requireEnsAllowed(ensName, allowedNames);
  const resolved = await resolveEnsSeller(ensName, rpcUrlOrProvider);
  if (!resolved.records.hederaAccount) {
    throw new EnsResolutionError(`${ensName} is missing hederaAccount text record`, "MISSING_RECORD");
  }
  if (resolved.records.hederaAccount.trim() !== expectedPayTo.trim()) {
    throw new EnsResolutionError(`${ensName} payTo mismatch (${resolved.records.hederaAccount} !== ${expectedPayTo})`, "MISSING_RECORD");
  }
  return resolved;
}