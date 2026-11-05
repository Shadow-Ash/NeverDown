import { ExpirationTime } from "@arkiv-network/sdk";
import { u64 } from "@arkiv-network/sdk/schema";
import { createArkivWalletClient } from "./client.js";
import { loadArkivWriteConfig, type ArkivConfig } from "./config.js";
import { CapabilityOffer } from "./schema.js";

export type SeedOfferSpec = {
  label: string;
  sellerens: string;
  serviceurl: string;
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

export function defaultSeedSpecs(merchantPayTo: string): SeedOfferSpec[] {
  const now = Date.now();
  const inSevenDays = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const alreadyPast = new Date(now - 60_000).toISOString();
  return [
    {
      label: "good-A",
      sellerens: "seller-a.neverdown.eth",
      serviceurl: "http://localhost:4001",
      pricetinybars: 10000n,
      chainid: 11155111n,
      category: "rpc",
      payto: merchantPayTo,
      expiration: ExpirationTime.fromDays(7),
      expiresat: inSevenDays,
    },
    {
      label: "good-B",
      sellerens: "seller-b.neverdown.eth",
      serviceurl: "http://localhost:4002",
      pricetinybars: 12000n,
      chainid: 11155111n,
      category: "rpc",
      payto: merchantPayTo,
      expiration: ExpirationTime.fromDays(7),
      expiresat: inSevenDays,
    },
    {
      label: "expired-C",
      sellerens: "malicious.neverdown.eth",
      serviceurl: "http://evil.example",
      pricetinybars: 1n,
      chainid: 11155111n,
      category: "rpc",
      payto: "0.0.99999999",
      // Short protocol life so queries drop it after a few seconds
      expiration: ExpirationTime.fromSeconds(4),
      expiresat: alreadyPast,
    },
  ];
}

export async function seedCapabilityOffers(opts: {
  specs?: SeedOfferSpec[];
  merchantPayTo?: string;
  config?: ArkivConfig;
  waitForShortLivedMs?: number;
}): Promise<SeededOffer[]> {
  const config = opts.config ?? loadArkivWriteConfig();
  const merchant =
    opts.merchantPayTo?.trim() ||
    process.env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() ||
    "0.0.11326899";
  const specs = opts.specs ?? defaultSeedSpecs(merchant);
  const { client } = createArkivWalletClient(config);

  const seeded: SeededOffer[] = [];
  for (const spec of specs) {
    const result = await client.createEntity(
      CapabilityOffer,
      {
        sellerens: spec.sellerens,
        serviceurl: spec.serviceurl,
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

  const waitMs = opts.waitForShortLivedMs ?? 10_000;
  if (specs.some((s) => s.label === "expired-C") && waitMs > 0) {
    // Let short-lived offer expire so discoverOffers excludes it.
    await new Promise((r) => setTimeout(r, waitMs));
  }

  return seeded;
}
