import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterOffers } from "../src/arkiv/discover.js";
import type { CapabilityOfferRow } from "../src/arkiv/schema.js";

function offer(partial: Partial<CapabilityOfferRow> & Pick<CapabilityOfferRow, "entityKey" | "payto" | "pricetinybars">): CapabilityOfferRow {
  return {
    sellerens: "x.eth",
    serviceurl: "http://localhost:4001",
    probeurl: "http://localhost:4001/probe",
    purchaseurl: "http://localhost:4001/rpc-pack",
    rpcurl: "http://localhost:4001/rpc",
    schemaversion: 2n,
    chainid: 11155111n,
    category: "rpc",
    expiresat: new Date(Date.now() + 60_000).toISOString(),
    ...partial,
  };
}

describe("filterOffers (hermetic)", () => {
  const sample = [
    offer({ entityKey: "0x1", payto: "0.0.1", pricetinybars: 10000n, category: "rpc" }),
    offer({ entityKey: "0x2", payto: "0.0.2", pricetinybars: 50000n, category: "rpc" }),
    offer({ entityKey: "0x3", payto: "0.0.1", pricetinybars: 10000n, category: "indexer" }),
  ];

  it("filters by category and max price", () => {
    const out = filterOffers(sample, { category: "rpc", maxPriceTinybars: 20000n });
    assert.deepEqual(
      out.map((o) => o.entityKey),
      ["0x1"],
    );
  });

  it("optionally filters allowlisted payTo", () => {
    const out = filterOffers(sample, {
      category: "rpc",
      maxPriceTinybars: 100000n,
      allowedPayTo: ["0.0.2"],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.payto, "0.0.2");
  });

  it("rejects expired, incomplete, and old-version offers", () => {
    const rows = [
      offer({ entityKey: "good", payto: "0.0.1", pricetinybars: 1n }),
      offer({ entityKey: "expired", payto: "0.0.1", pricetinybars: 1n, expiresat: new Date(Date.now() - 1000).toISOString() }),
      offer({ entityKey: "old", payto: "0.0.1", pricetinybars: 1n, schemaversion: 1n }),
      offer({ entityKey: "missing", payto: "0.0.1", pricetinybars: 1n, probeurl: "" }),
    ];
    assert.deepEqual(filterOffers(rows, { category: "rpc", maxPriceTinybars: 10n }).map((o) => o.entityKey), ["good"]);
  });
});
