import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liveSeedSpec } from "../src/arkiv/seed.js";

const valid = {
  SELLER_ENS_NAME: "seller.example.eth",
  SELLER_URL: "https://seller.example.com",
  HEDERA_MERCHANT_ACCOUNT_ID: "0.0.12345",
  HEDERA_X402_PRICE_SMALLEST_UNITS: "10000",
  POC_EXPECTED_CHAIN_ID: "11155111",
};

describe("live Arkiv offer seed", () => {
  it("uses the verified seller base for all three capability paths", () => {
    const offer = liveSeedSpec(valid);
    assert.equal(offer.sellerens, "seller.example.eth");
    assert.equal(offer.serviceurl, "https://seller.example.com");
    assert.equal(offer.probeurl, "https://seller.example.com/probe");
    assert.equal(offer.purchaseurl, "https://seller.example.com/rpc-pack");
    assert.equal(offer.rpcurl, "https://seller.example.com/rpc");
    assert.equal(offer.payto, "0.0.12345");
    assert.equal(offer.pricetinybars, 10000n);
  });

  it("rejects missing identity, unsafe remote URLs, and invalid price before any write", () => {
    assert.throws(() => liveSeedSpec({ ...valid, SELLER_ENS_NAME: "" }), /SELLER_ENS_NAME/);
    assert.throws(() => liveSeedSpec({ ...valid, SELLER_URL: "http://seller.example.com" }), /SELLER_URL/);
    assert.throws(() => liveSeedSpec({ ...valid, HEDERA_X402_PRICE_SMALLEST_UNITS: "0" }), /HEDERA_X402_PRICE_SMALLEST_UNITS/);
    assert.throws(() => liveSeedSpec({ ...valid, POC_EXPECTED_CHAIN_ID: "1" }), /POC_EXPECTED_CHAIN_ID/);
  });
});
