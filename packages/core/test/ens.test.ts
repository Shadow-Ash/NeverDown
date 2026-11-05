import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnsSeller, requireEnsAllowed, resolveAndValidateEnsSeller, EnsResolutionError } from "../src/ens/resolve.js";

function fakeProvider(resolver: any) {
  return { async getResolver() { return resolver; } } as any;
}

describe("C6 ENS (hermetic, mocked provider)", () => {
  it("resolves text records and ENS address", async () => {
    const fake = fakeProvider({
      async getText(key: string) { return key === "hederaAccount" ? "0.0.4242" : "https://x"; },
      async getAddress() { return "0xabc"; },
    });
    const r = await resolveEnsSeller("seller.eth", fake);
    assert.equal(r.records.hederaAccount, "0.0.4242");
    assert.equal(r.records.x402Url, "https://x");
    assert.equal(r.address, "0xabc");
  });

  it("fails closed if allowlisted name not configured", () => {
    assert.throws(() => requireEnsAllowed("notallowed.eth", ["allowed.eth"]), EnsResolutionError);
  });

  it("rejects missing hederaAccount text record", async () => {
    const fake = fakeProvider({
      async getText() { return null; },
      async getAddress() { return null; },
    });
    await assert.rejects(() => resolveAndValidateEnsSeller("seller.eth", "0.0.4242", fake, ["seller.eth"]), (e: unknown) => e instanceof EnsResolutionError);
  });

  it("rejects mismatched payTo", async () => {
    const fake = fakeProvider({
      async getText(key: string) { return key === "hederaAccount" ? "0.0.9999" : null; },
      async getAddress() { return null; },
    });
    await assert.rejects(() => resolveAndValidateEnsSeller("seller.eth", "0.0.4242", fake, ["seller.eth"]), (e: unknown) => e instanceof EnsResolutionError);
  });

  it("resolves allowed seller when records match", async () => {
    const fake = fakeProvider({
      async getText(key: string) { return key === "hederaAccount" ? "0.0.4242" : "value"; },
      async getAddress() { return null; },
    });
    const r = await resolveAndValidateEnsSeller("seller.eth", "0.0.4242", fake, ["seller.eth"]);
    assert.equal(r.records.hederaAccount, "0.0.4242");
  });
});