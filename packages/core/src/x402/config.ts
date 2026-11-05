const HEDERA_ACCOUNT_ID = /^0\.0\.[1-9]\d*$/;

export class BuyerConfigError extends Error {
  readonly envVar?: string;

  constructor(message: string, envVar?: string) {
    super(message);
    this.name = "BuyerConfigError";
    this.envVar = envVar;
  }
}

export type BuyerConfig = {
  network: "hedera:testnet";
  spendAccountId: string;
  spendPrivateKey: string;
  sellerUrl: string;
};

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new BuyerConfigError(`Missing required environment variable: ${name}`, name);
  }
  return value;
}

/**
 * Load C2 buyer settings. Never logs or returns the private key beyond the config object.
 */
export function loadBuyerConfig(env: NodeJS.ProcessEnv = process.env): BuyerConfig {
  const networkRaw = env.HEDERA_NETWORK?.trim() || "testnet";
  if (networkRaw !== "testnet" && networkRaw !== "hedera:testnet") {
    throw new BuyerConfigError(
      "HEDERA_NETWORK must be 'testnet' (mainnet is out of scope for C2)",
      "HEDERA_NETWORK",
    );
  }

  const spendAccountId = requireValue(env, "HEDERA_SPEND_ID");
  if (!HEDERA_ACCOUNT_ID.test(spendAccountId)) {
    throw new BuyerConfigError(
      "HEDERA_SPEND_ID must look like 0.0.12345",
      "HEDERA_SPEND_ID",
    );
  }

  const spendPrivateKey = requireValue(env, "HEDERA_SPEND_KEY");

  const sellerUrlRaw = env.SELLER_URL?.trim() || "http://localhost:4001";
  let sellerUrl: URL;
  try {
    sellerUrl = new URL(sellerUrlRaw);
  } catch {
    throw new BuyerConfigError("SELLER_URL must be a valid URL", "SELLER_URL");
  }
  if (sellerUrl.protocol !== "http:" && sellerUrl.protocol !== "https:") {
    throw new BuyerConfigError("SELLER_URL must use http or https", "SELLER_URL");
  }

  return {
    network: "hedera:testnet",
    spendAccountId,
    spendPrivateKey,
    sellerUrl: sellerUrl.toString().replace(/\/$/, ""),
  };
}
