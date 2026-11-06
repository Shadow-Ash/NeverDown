import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";

export type IncidentStatus = "STARTED" | "COMPLETED" | "FAILED" | "UNCERTAIN";
export type IncidentRecord = { incidentId: string; eventId: string; status: IncidentStatus; createdAt: string; updatedAt: string; receipt: unknown | null };
export type GatewayIncidentSnapshot = { runtimeId: string; recentEvents: Array<{ id: string; incidentId: string; reason: string; newActive: string | null }> };
export type ProcureResult = { success: boolean; purchase?: { status?: string } | null };

export class IncidentLedger {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec("CREATE TABLE IF NOT EXISTS incidents (incident_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, receipt_json TEXT)");
  }

  claim(incidentId: string, eventId: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare("INSERT OR IGNORE INTO incidents (incident_id, event_id, status, created_at, updated_at) VALUES (?, ?, 'STARTED', ?, ?)").run(incidentId, eventId, now, now);
    return result.changes === 1;
  }

  finish(incidentId: string, status: Exclude<IncidentStatus, "STARTED">, receipt: unknown): void {
    const json = JSON.stringify(receipt, (key, value) => key === "entitlementToken" ? undefined : typeof value === "bigint" ? value.toString() : value);
    this.db.prepare("UPDATE incidents SET status = ?, updated_at = ?, receipt_json = ? WHERE incident_id = ? AND status = 'STARTED'").run(status, new Date().toISOString(), json, incidentId);
  }

  get(incidentId: string): IncidentRecord | undefined {
    const row = this.db.prepare("SELECT incident_id, event_id, status, created_at, updated_at, receipt_json FROM incidents WHERE incident_id = ?").get(incidentId) as { incident_id: string; event_id: string; status: IncidentStatus; created_at: string; updated_at: string; receipt_json: string | null } | undefined;
    if (!row) return undefined;
    return { incidentId: row.incident_id, eventId: row.event_id, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, receipt: row.receipt_json ? JSON.parse(row.receipt_json) : null };
  }

  close(): void { this.db.close(); }
}

export class IncidentCoordinator {
  private polling = false;
  constructor(private readonly ledger: IncidentLedger, private readonly fetchStatus: () => Promise<GatewayIncidentSnapshot>, private readonly procure: (incidentId: string) => Promise<ProcureResult>) {}

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      let snapshot: GatewayIncidentSnapshot;
      try { snapshot = await this.fetchStatus(); } catch { return; }
      for (const event of snapshot.recentEvents ?? []) {
        if (event.reason !== "failover completed" || event.newActive !== "standby" || !event.incidentId.startsWith(`${snapshot.runtimeId}:`)) continue;
        if (!this.ledger.claim(event.incidentId, event.id)) continue;
        try {
          const receipt = await this.procure(event.incidentId);
          const status: Exclude<IncidentStatus, "STARTED"> = receipt.purchase?.status === "UNCERTAIN" ? "UNCERTAIN" : receipt.success ? "COMPLETED" : "FAILED";
          this.ledger.finish(event.incidentId, status, receipt);
        } catch {
          this.ledger.finish(event.incidentId, "UNCERTAIN", { success: false, notes: ["procurement interrupted; reconcile before retry"] });
        }
      }
    } finally { this.polling = false; }
  }
}
