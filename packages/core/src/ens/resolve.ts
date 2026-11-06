import { AbiCoder, Contract, Interface, JsonRpcProvider, namehash } from "ethers";

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

/** Upgradable Universal Resolver proxy (ENSv1 + ENSv2 on mainnet/Sepolia). */
export const UNIVERSAL_RESOLVER_ADDRESS = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";

const RESOLVER_IFACE = new Interface([
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
]);

const UR_ABI = ["function resolve(bytes name, bytes data) view returns (bytes, address)"] as const;

function normalizeName(value: string): string | null {
  try {
    const name = value.trim().toLowerCase().replace(/\.$/, "");
    if (name && name.includes(".")) return name;
    return null;
  } catch {
    return null;
  }
}

/** DNS wire-format name for Universal Resolver `resolve(bytes,bytes)`. */
export function dnsEncodeName(name: string): string {
  const labels = name.trim().toLowerCase().replace(/\.$/, "").split(".");
  let out = "0x";
  for (const label of labels) {
    const bytes = Buffer.from(label, "utf8");
    if (bytes.length === 0 || bytes.length > 63) throw new EnsResolutionError(`invalid ENS label in ${name}`, "RESOLVE_FAILED");
    out += bytes.length.toString(16).padStart(2, "0") + bytes.toString("hex");
  }
  return out + "00";
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

type ProviderLike = {
  getResolver?(name: string): Promise<{ getText(key: string): Promise<string | null>; getAddress(): Promise<string | null>; address?: string } | null>;
  call?(tx: { to: string; data: string }): Promise<string>;
};

async function resolveViaUniversalResolver(
  provider: JsonRpcProvider,
  normalized: string,
): Promise<EnsSellerResolution> {
  const ur = new Contract(UNIVERSAL_RESOLVER_ADDRESS, UR_ABI, provider);
  const dns = dnsEncodeName(normalized);
  const node = namehash(normalized);
  const coder = AbiCoder.defaultAbiCoder();

  const call = async (data: string): Promise<{ ret: string; resolver: string }> => {
    const [ret, resolver] = await ur.resolve.staticCall(dns, data);
    return { ret, resolver: String(resolver) };
  };

  let address: string | null = null;
  let resolverAddress: string | null = null;
  try {
    const { ret, resolver } = await call(RESOLVER_IFACE.encodeFunctionData("addr", [node]));
    resolverAddress = resolver;
    address = coder.decode(["address"], ret)[0] as string;
    if (address === "0x0000000000000000000000000000000000000000") address = null;
  } catch (e) {
    throw new EnsResolutionError(`No ENS resolver for ${normalized}`, "RESOLVE_FAILED", e);
  }

  const records: EnsTextRecords = {};
  try {
    for (const [field, key] of Object.entries(DEFAULT_TEXT_KEYS) as Array<[keyof EnsTextRecords, string]>) {
      try {
        const { ret } = await call(RESOLVER_IFACE.encodeFunctionData("text", [node, key]));
        const value = (coder.decode(["string"], ret)[0] as string)?.trim();
        if (value) records[field] = value;
      } catch {
        // missing text key is fine
      }
    }
  } catch (e) {
    throw new EnsResolutionError(`text record lookup failed for ${normalized}`, "RESOLVE_FAILED", e);
  }

  return {
    ensName: normalized,
    normalizedEnsName: normalized,
    address,
    records: applyOptionalTextOverlay(records),
    resolverAddress,
  };
}

async function resolveViaClassicResolver(
  provider: ProviderLike,
  name: string,
  normalized: string,
): Promise<EnsSellerResolution | null> {
  if (!provider.getResolver) return null;
  const rawResolver = await provider.getResolver(normalized);
  if (!rawResolver) return null;
  const resolver = rawResolver as unknown as { getText(key: string): Promise<string | null>; getAddress(): Promise<string | null>; address?: string };
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
    resolverAddress: resolver.address ?? null,
  };
}

export async function resolveEnsSeller(name: string, rpcUrlOrProvider: string | JsonRpcProvider | ProviderLike): Promise<EnsSellerResolution> {
  const normalized = normalizeName(name);
  if (!normalized) throw new EnsResolutionError("invalid ENS name", "RESOLVE_FAILED");

  const provider =
    typeof rpcUrlOrProvider === "string" ? new JsonRpcProvider(rpcUrlOrProvider) : rpcUrlOrProvider;

  const classic = await resolveViaClassicResolver(provider as ProviderLike, name, normalized);
  if (classic) return classic;

  // ENSv2 names often have no classic registry owner; fall back to Universal Resolver.
  if (provider instanceof JsonRpcProvider || typeof rpcUrlOrProvider === "string") {
    const json =
      provider instanceof JsonRpcProvider ? provider : new JsonRpcProvider(rpcUrlOrProvider as string);
    return resolveViaUniversalResolver(json, normalized);
  }

  throw new EnsResolutionError(`No ENS resolver for ${name}`, "RESOLVE_FAILED");
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
  rpcUrlOrProvider: string | JsonRpcProvider | ProviderLike,
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
