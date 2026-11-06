import { ExpirationTime } from "@arkiv-network/sdk";
import { u64 } from "@arkiv-network/sdk/schema";
import { createArkivWalletClient } from "./client.js";
import { loadArkivWriteConfig, type ArkivConfig } from "./config.js";
import { CapabilityOffer } from "./schema.js";

export type SeedOfferSpec = {
  label: string;
  sellerens: string;
  serviceurl: string;
  probeurl: string;
  purchaseurl: string;
  rpcurl: string;
  pricetinybars: bigint;
  chainid: bigint;
  category: string;
  payto: string;
  /** Protocol lifetime */
  expiration: ReturnType<typeof ExpirationTime.fromDays>;
  /** App-level ISO expiry string stored on the entity */
  expiresat: string;
};

export type SeededOffer = {
  label: string;
  entityKey: string;
  txHash: string;
  expiresAtBlock: bigint;
  payto: string;
  category: string;
  pricetinybars: bigint;
};

export function liveSeedSpec(env: NodeJS.ProcessEnv = process.env): SeedOfferSpec {
  const sellerens = env.SELLER_ENS_NAME?.trim().toLowerCase() || "";
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(sellerens)) throw new Error("SELLER_ENS_NAME must be a valid ENS name");
  const rawUrl = env.SELLER_URL?.trim() || "";
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("SELLER_URL must be a valid seller base URL"); }
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("SELLER_URL must be an HTTPS base URL (HTTP only for localhost), without credentials, query, or path");
  }
  const serviceurl = url.origin;
  const payto = env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() || "";
  if (!/^0\.0\.[1-9]\d*$/.test(payto)) throw new Error("HEDERA_MERCHANT_ACCOUNT_ID must be a Hedera account ID");
  const priceRaw = env.HEDERA_X402_PRICE_SMALLEST_UNITS?.trim() || "";
  if (!/^[1-9]\d*$/.test(priceRaw)) throw new Error("HEDERA_X402_PRICE_SMALLEST_UNITS must be a positive integer");
  const chainRaw = env.POC_EXPECTED_CHAIN_ID?.trim() || "";
  if (chainRaw !== "11155111") throw new Error("POC_EXPECTED_CHAIN_ID must be 11155111 for the RPC demo");
  return {
    label: "live-rpc",
    sellerens,
    serviceurl,
    probeurl: `${serviceurl}/probe`,
    purchaseurl: `${serviceurl}/rpc-pack`,
    rpcurl: `${serviceurl}/rpc`,
    pricetinybars: BigInt(priceRaw),
    chainid: BigInt(chainRaw),
    category: "rpc",
    payto,
    expiration: ExpirationTime.fromDays(7),
    expiresat: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function seedCapabilityOffers(opts: {
  specs: SeedOfferSpec[];
  config?: ArkivConfig;
}): Promise<SeededOffer[]> {
  const config = opts.config ?? loadArkivWriteConfig();
  const { client } = createArkivWalletClient(config);

  const seeded: SeededOffer[] = [];
  for (const spec of opts.specs) {
    const result = await client.createEntity(
      CapabilityOffer,
      {
        sellerens: spec.sellerens,
        serviceurl: spec.serviceurl,
        schemaversion: u64(2n),
        probeurl: spec.probeurl,
        purchaseurl: spec.purchaseurl,
        rpcurl: spec.rpcurl,
        pricetinybars: u64(spec.pricetinybars),
        chainid: u64(spec.chainid),
        category: spec.category,
        payto: spec.payto,
        expiresat: spec.expiresat,
      },
      { expiration: spec.expiration },
    );
    seeded.push({
      label: spec.label,
      entityKey: result.entityKey,
      txHash: result.txHash,
      expiresAtBlock: result.expiresAt,
      payto: spec.payto,
      category: spec.category,
      pricetinybars: spec.pricetinybars,
    });
  }

  return seeded;
}
