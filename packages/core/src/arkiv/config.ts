export class ArkivConfigError extends Error {
  readonly envVar?: string;
  constructor(message: string, envVar?: string) {
    super(message);
    this.name = "ArkivConfigError";
    this.envVar = envVar;
  }
}

export type ArkivConfig = {
  accessKey: string;
  privateKey?: `0x${string}`;
  chainId: number;
  rpcUrl: string;
};

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ArkivConfigError(`Missing required environment variable: ${name}`, name);
  }
  return value;
}

/** Read-only config (query). Access key may be empty string for public RPC (rate-limited). */
export function loadArkivReadConfig(env: NodeJS.ProcessEnv = process.env): ArkivConfig {
  const accessKey = env.ARKIV_ACCESS_KEY?.trim() ?? "";
  const chainIdRaw = env.ARKIV_CHAIN_ID?.trim() || "7794095";
  const chainId = Number.parseInt(chainIdRaw, 10);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new ArkivConfigError("ARKIV_CHAIN_ID must be a positive integer", "ARKIV_CHAIN_ID");
  }
  return {
    accessKey,
    chainId,
    rpcUrl: env.ARKIV_RPC?.trim() || "https://rpc.rabdi.db-chain.testnet.arkiv.network",
  };
}

/** Write config (seed). Requires funded private key + preferably a Hub access key. */
export function loadArkivWriteConfig(env: NodeJS.ProcessEnv = process.env): ArkivConfig {
  const base = loadArkivReadConfig(env);
  const rawKey = requireValue(env, "ARKIV_PRIVATE_KEY");
  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new ArkivConfigError(
      "ARKIV_PRIVATE_KEY must be a 32-byte hex key (0x…)",
      "ARKIV_PRIVATE_KEY",
    );
  }
  return { ...base, privateKey };
}
