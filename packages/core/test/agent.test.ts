import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHermeticToolBelt, runAgentScenario } from "../src/agent/index.js";

describe("C8 supreme agent (hermetic)", () => {
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
