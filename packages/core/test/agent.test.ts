import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHermeticToolBelt, createLiveToolBelt, runAgentScenario } from "../src/agent/index.js";

describe("C8 supreme agent (hermetic)", () => {
  it("live seller resolution fails closed without an ENS allowlist", async () => {
    const tools = createLiveToolBelt({ ENS_RPC_URL: "https://example.com", ENS_ALLOWLIST_NAMES: "", POLICY_DB_PATH: ":memory:" });
    await assert.rejects(tools.resolve_seller({ ensName: "unknown.eth", expectedPayTo: "0.0.1" }), /ENS_ALLOWLIST_NAMES/);
  });
  it("probes the public URL and installs only the RPC URL after settlement", async () => {
    const tools = createHermeticToolBelt();
    const probed: string[] = [];
    const installed: string[] = [];
    const originalProbe = tools.proof_of_capability;
    const originalInstall = tools.install_standby;
    tools.proof_of_capability = async (input) => { probed.push(input.rpcUrl); return originalProbe(input); };
    tools.install_standby = async (input) => { installed.push(input.rpcUrl); return originalInstall(input); };
    const receipt = await runAgentScenario("procure", tools);
    assert.equal(receipt.success, true);
    assert.deepEqual(probed, ["http://candidate-rpc.local/probe"]);
    assert.deepEqual(installed, ["http://candidate-rpc.local/rpc"]);
  });

  it("does not install after authorization without settlement", async () => {
    const tools = createHermeticToolBelt();
    let installed = false;
    tools.request_purchase = async () => ({ approved: true, settled: false });
    tools.install_standby = async () => { installed = true; return { installed: true, detail: {} }; };
    const receipt = await runAgentScenario("procure", tools);
    assert.equal(receipt.success, false);
    assert.equal(installed, false);
  });
  it("procure: discover → ens → poc → purchase → install", async () => {
    const tools = createHermeticToolBelt();
    const receipt = await runAgentScenario("procure", tools);
    assert.equal(receipt.success, true);
    assert.equal(receipt.scenario, "procure");
    assert.ok(receipt.steps.some((s) => s.tool === "discover_offers" && s.ok));
    assert.ok(receipt.steps.some((s) => s.tool === "resolve_seller" && s.ok));
    assert.ok(receipt.steps.some((s) => s.tool === "proof_of_capability" && s.ok));
    assert.ok(receipt.steps.some((s) => s.tool === "request_purchase" && s.ok));
    assert.ok(receipt.steps.some((s) => s.tool === "install_standby" && s.ok));
    assert.equal(receipt.selectedOffer?.sellerens, "good.neverdown.eth");
  });

  it("deny: force_bad_purchase never settles", async () => {
    const tools = createHermeticToolBelt();
    const receipt = await runAgentScenario("deny", tools);
    assert.equal(receipt.success, true);
    assert.equal(receipt.scenario, "deny");
    assert.ok(receipt.denyReason);
    assert.equal((receipt.purchase as { approved?: boolean })?.approved, false);
    assert.ok(!receipt.steps.some((s) => s.tool === "install_standby"));
  });
});
