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
