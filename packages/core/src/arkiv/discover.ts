import { and, eq, lte } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk/schema";
import { createArkivPublicClient } from "./client.js";
import { loadArkivReadConfig, type ArkivConfig } from "./config.js";
import { CapabilityOffer, type CapabilityOfferRow } from "./schema.js";

export type DiscoverOffersInput = {
  category: string;
  maxPriceTinybars: bigint | number | string;
  /** Optional: also require payTo allowlist match (C6 will feed ENS). */
  allowedPayTo?: string[];
  config?: ArkivConfig;
};

function toBigInt(v: bigint | number | string): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v < 0) throw new Error("maxPriceTinybars must be a non-negative integer");
    return BigInt(v);
  }
  if (!/^\d+$/.test(v.trim())) throw new Error("maxPriceTinybars must be a non-negative integer string");
  return BigInt(v.trim());
}

/** Pure post-filter used by discover + hermetic tests. */
export function filterOffers(
  offers: CapabilityOfferRow[],
  opts: { category: string; maxPriceTinybars: bigint; allowedPayTo?: string[] },
): CapabilityOfferRow[] {
  return offers.filter((o) => {
    if (o.schemaversion !== 2n) return false;
    const expiry = Date.parse(o.expiresat);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
    if (!o.probeurl || !o.purchaseurl || !o.rpcurl || !o.sellerens || !o.payto || o.pricetinybars <= 0n) return false;
    if (o.category !== opts.category) return false;
    if (o.pricetinybars > opts.maxPriceTinybars) return false;
    if (opts.allowedPayTo && opts.allowedPayTo.length > 0 && !opts.allowedPayTo.includes(o.payto)) {
      return false;
    }
    return true;
  });
}

/**
 * Query live NeverDown capability offers on Arkiv Rabdi.
 * Expired entities are already omitted by the protocol once `$expiresAt` passes.
 */
export async function discoverOffers(input: DiscoverOffersInput): Promise<CapabilityOfferRow[]> {
  const config = input.config ?? loadArkivReadConfig();
  const maxPrice = toBigInt(input.maxPriceTinybars);
  const publicClient = createArkivPublicClient(config);

  const { entities } = await publicClient
    .select({
      $key: true,
      $expiresAt: true,
      sellerens: true,
      serviceurl: true,
      schemaversion: true,
      probeurl: true,
      purchaseurl: true,
      rpcurl: true,
      pricetinybars: true,
      chainid: true,
      category: true,
      payto: true,
      expiresat: true,
    })
    .from(CapabilityOffer)
    .where(and(eq("category", input.category), lte("pricetinybars", u64(maxPrice))))
    .fetch();

  const rows: CapabilityOfferRow[] = entities.map((row) => ({
    entityKey: row.$key,
    sellerens: row.sellerens.value,
    serviceurl: row.serviceurl.value,
    schemaversion: row.schemaversion.value,
    probeurl: row.probeurl.value,
    purchaseurl: row.purchaseurl.value,
    rpcurl: row.rpcurl.value,
    pricetinybars: row.pricetinybars.value,
    chainid: row.chainid.value,
    category: row.category.value,
    payto: row.payto.value,
    expiresat: row.expiresat.value,
    expiresAtBlock: row.$expiresAt,
  }));

  return filterOffers(rows, {
    category: input.category,
    maxPriceTinybars: maxPrice,
    allowedPayTo: input.allowedPayTo,
  });
}
