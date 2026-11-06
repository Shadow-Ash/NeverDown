import type { IncidentLedger } from "../../../packages/core/src/agent/coordinator.js";

export function evidenceResponse(pathname: string, ledger: IncidentLedger): { status: number; body: unknown } {
  if (pathname === "/api/incidents") {
    return { status: 200, body: { incidents: ledger.list(50).map(({ receipt, ...summary }) => summary) } };
  }
  if (!pathname.startsWith("/api/incidents/")) return { status: 404, body: { error: "unknown route" } };
  let incidentId: string;
  try { incidentId = decodeURIComponent(pathname.slice("/api/incidents/".length)); } catch { return { status: 400, body: { error: "invalid incident id" } }; }
  if (!/^[A-Za-z0-9:._-]{1,150}$/.test(incidentId)) return { status: 400, body: { error: "invalid incident id" } };
  const incident = ledger.get(incidentId);
  return incident ? { status: 200, body: incident } : { status: 404, body: { error: "incident not found" } };
}
