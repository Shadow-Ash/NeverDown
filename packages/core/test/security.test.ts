import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import "../src/payment-worker/index.js";

describe("C3 payment security surface", () => {
  it("does not expose raw payment or signing helpers from public barrel", () => {
    const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    for (const banned of ["payForRpcOnce", "createHederaX402HttpClient", "loadBuyerConfig", "HederaHcsClient", "openBudgetStore", "securePurchase"]) {
      assert(!index.includes(banned), `public barrel must not expose ${banned}`);
    }
  });

  it("spend controls are never disabled", () => {
    const src = readFileSync(new URL("../src/x402/client.ts", import.meta.url), "utf8");
    assert(!src.includes("setSpendControls(false)"));
    assert(src.includes("maxPaymentTinybars"));
    assert(src.includes("allowedAssets"));
  });

  it("source does not leak secret environment values", () => {
    const src = readFileSync(new URL("../src/payment-worker/protocol.ts", import.meta.url), "utf8");
    assert(!src.toLowerCase().includes("privatekey"), "IPC protocol must never contain private key material");
    assert(!src.includes("HEDERA_SPEND_KEY"));
  });
});
