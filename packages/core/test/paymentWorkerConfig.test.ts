import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPurchaseDeps } from "../src/payment-worker/purchase.js";

it("requires an HCS topic and operator before starting a durable payment worker", () => {
  const dir = mkdtempSync(join(tmpdir(), "nd-hcs-required-"));
  try {
    assert.throws(() => buildPurchaseDeps({
      HEDERA_SPEND_ID: "0.0.1111",
      HEDERA_MERCHANT_ACCOUNT_ID: "0.0.2222",
      POLICY_DB_PATH: join(dir, "policy.sqlite"),
      HCS_AUDIT_AVAILABILITY: "REQUIRED_DURABLE",
    }), /HCS/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
