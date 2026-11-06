import assert from "node:assert/strict";
import { it } from "node:test";
import { IncidentLedger } from "../../../packages/core/src/agent/coordinator.js";
import { evidenceResponse } from "../src/evidence.js";

it("exposes persisted incident summaries and detail without credentials", () => {
  const ledger = new IncidentLedger(":memory:");
  try {
    ledger.claim("runtime:INC-1", "runtime:EVT-1");
    ledger.finish("runtime:INC-1", "COMPLETED", { purchase: { status: "SETTLED", transactionId: "tx-1", entitlementToken: "secret-token" } });
    const list = evidenceResponse("/api/incidents", ledger);
    assert.equal(list.status, 200);
    assert.equal((list.body as { incidents: unknown[] }).incidents.length, 1);
    const detail = evidenceResponse("/api/incidents/runtime%3AINC-1", ledger);
    assert.equal(detail.status, 200);
    assert.ok(!JSON.stringify(detail.body).includes("secret-token"));
    assert.equal(evidenceResponse("/api/incidents/missing", ledger).status, 404);
  } finally { ledger.close(); }
});
