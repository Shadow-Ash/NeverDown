import { IncidentCoordinator, IncidentLedger, type GatewayIncidentSnapshot } from "../packages/core/src/agent/coordinator.js";
import { createLiveToolBelt, runAgentScenario } from "../packages/core/src/agent/index.js";

const gatewayUrl = (process.env.GATEWAY_URL?.trim() || "http://localhost:8787").replace(/\/+$/, "");
const ledger = new IncidentLedger(process.env.INCIDENT_DB_PATH?.trim() || "neverdown-incidents.sqlite");
const tools = createLiveToolBelt(process.env);

const coordinator = new IncidentCoordinator(
  ledger,
  async (): Promise<GatewayIncidentSnapshot> => {
    const response = await fetch(`${gatewayUrl}/status`, { signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!response.ok) throw new Error("gateway status unavailable");
    return await response.json() as GatewayIncidentSnapshot;
  },
  async (incidentId) => {
    const receipt = await runAgentScenario("procure", tools);
    console.log(`incident ${incidentId}: ${receipt.success ? "completed" : "stopped"}`);
    return receipt;
  },
);

const tick = () => { void coordinator.poll().catch((error: unknown) => console.error("coordinator poll failed:", error instanceof Error ? error.name : "unknown")); };
tick();
const interval = setInterval(tick, 2000);
process.on("SIGINT", () => { clearInterval(interval); ledger.close(); process.exit(0); });
process.on("SIGTERM", () => { clearInterval(interval); ledger.close(); process.exit(0); });
