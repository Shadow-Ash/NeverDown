import { defineSchema, str, u64 } from "@arkiv-network/sdk/schema";

/**
 * NeverDown capability offer (hackathon demo category: rpc).
 * Attribute names are lowercase per Arkiv / chunk conventions.
 */
export const CapabilityOffer = defineSchema("neverdown.capabilityoffer", {
  sellerens: str().indexed(),
  serviceurl: str(),
  pricetinybars: u64().indexed(),
  chainid: u64().indexed(),
  category: str().indexed(),
  payto: str().indexed(),
  expiresat: str(),
});

export type CapabilityOfferRow = {
  entityKey: string;
  sellerens: string;
  serviceurl: string;
  pricetinybars: bigint;
  chainid: bigint;
  category: string;
  payto: string;
  expiresat: string;
  expiresAtBlock?: bigint;
};
