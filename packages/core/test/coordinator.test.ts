import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IncidentCoordinator, IncidentLedger } from "../src/agent/coordinator.js";

it("procures once per failover across polls and coordinator restarts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nd-incident-"));
  const db = join(dir, "incidents.sqlite");
  const snapshot = { runtimeId: "runtime-a", recentEvents: [{ id: "runtime-a:EVT-1", incidentId: "runtime-a:INC-1", reason: "failover completed", newActive: "standby" }] };
  let calls = 0;
  const procure = async () => { calls++; return { success: true, purchase: { status: "SETTLED" } }; };
  try {
    const firstLedger = new IncidentLedger(db);
    const first = new IncidentCoordinator(firstLedger, async () => snapshot, procure);
    await first.poll();
    await first.poll();
    firstLedger.close();
    const secondLedger = new IncidentLedger(db);
    const second = new IncidentCoordinator(secondLedger, async () => snapshot, procure);
    await second.poll();
    assert.equal(calls, 1);
    assert.equal(secondLedger.get("runtime-a:INC-1")?.status, "COMPLETED");
    secondLedger.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("keeps uncertain purchases from automatic retry", async () => {
  const ledger = new IncidentLedger(":memory:");
  let calls = 0;
  const coordinator = new IncidentCoordinator(ledger, async () => ({ runtimeId: "r", recentEvents: [{ id: "r:EVT-1", incidentId: "r:INC-1", reason: "failover completed", newActive: "standby" }] }), async () => { calls++; return { success: false, purchase: { status: "UNCERTAIN" } }; });
  try {
    await coordinator.poll();
    await coordinator.poll();
    assert.equal(calls, 1);
    assert.equal(ledger.get("r:INC-1")?.status, "UNCERTAIN");
  } finally { ledger.close(); }
});

it("lists persisted evidence without exposing an entitlement token", () => {
  const ledger = new IncidentLedger(":memory:");
  try {
    assert.equal(ledger.claim("runtime-a:INC-2", "runtime-a:EVT-2"), true);
    ledger.finish("runtime-a:INC-2", "COMPLETED", { success: true, purchase: { status: "SETTLED", entitlementToken: "private-secret-token" }, selectedOffer: { pricetinybars: 10n } });
    const rows = ledger.list(10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "COMPLETED");
    assert.ok(!JSON.stringify(rows).includes("private-secret-token"));
  } finally { ledger.close(); }
});
