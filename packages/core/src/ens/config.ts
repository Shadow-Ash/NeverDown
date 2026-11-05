export type EnsConfig = {
  rpcUrl: string;
  allowlistedNames: string[];
};

export function loadEnsConfig(env: NodeJS.ProcessEnv = process.env): EnsConfig | undefined {
  const rpcUrl = env.ENS_RPC_URL?.trim();
  if (!rpcUrl) return undefined;
  const names = env.ENS_ALLOWLIST_NAMES?.trim();
  return {
    rpcUrl,
    allowlistedNames: names ? names.split(/[,\s;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean) : [],
  };
}