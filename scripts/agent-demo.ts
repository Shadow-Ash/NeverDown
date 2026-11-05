/**
 * C8 Supreme Agent demo — Act 3 procure / Act 4 deny.
 *
 *   pnpm agent:demo --scenario procure
 *   pnpm agent:demo --scenario deny
 *
 * Default: hermetic tools (no LLM / no live chain).
 * Live tools: --live (needs Arkiv/ENS/gateway env as applicable)
 */
import {
  createHermeticToolBelt,
  createLiveToolBelt,
  runAgentScenario,
  type AgentScenario,
} from "../packages/core/src/agent/index.js";

function parseArgs(argv: string[]): { scenario: AgentScenario; live: boolean } {
  let scenario: AgentScenario = "procure";
  let live = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenario" && argv[i + 1]) {
      const v = argv[++i]!;
      if (v !== "procure" && v !== "deny") throw new Error("--scenario must be procure|deny");
      scenario = v;
    } else if (a === "--live") {
      live = true;
    }
  }
  return { scenario, live };
}

async function main(): Promise<void> {
  const { scenario, live } = parseArgs(process.argv.slice(2));
  const tools = live ? createLiveToolBelt(process.env) : createHermeticToolBelt();
  console.log(`NeverDown Supreme Agent · scenario=${scenario} · mode=${live ? "live" : "hermetic"}`);
  console.log("System: stay inside policy; prefer cheapest valid offer; never install without PoC.");

  const receipt = await runAgentScenario(scenario, tools);
  console.log(JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  process.exitCode = receipt.success ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
