import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PolicyConfigError,
  loadPolicyState,
  parseAllowlist,
} from "../src/policy/config.js";

describe("parseAllowlist", () => {
  it("parses sellerId:payTo pairs", () => {
    const list = parseAllowlist("neverdown-rpc:0.0.11326899, other:0.0.2");
    assert.deepEqual(list, [
      { sellerId: "neverdown-rpc", payTo: "0.0.11326899" },
      { sellerId: "other", payTo: "0.0.2" },
    ]);
  });

  it("rejects bad shapes", () => {
    assert.throws(() => parseAllowlist(""), (e) => e instanceof PolicyConfigError);
    assert.throws(() => parseAllowlist("only-seller"), (e) => e instanceof PolicyConfigError);
    assert.throws(() => parseAllowlist("x:bad"), (e) => e instanceof PolicyConfigError);
  });
});

describe("loadPolicyState", () => {
  it("loads cap and allowlist from env", () => {
    const state = loadPolicyState({
      POLICY_CAP_TINYBARS: "50000",
      POLICY_ALLOWLIST: "neverdown-rpc:0.0.11326899",
      POLICY_VERSION: "test-v1",
    });
    assert.equal(state.capTinybars, 50000n);
    assert.equal(state.spentTinybars, 0n);
    assert.equal(state.policyVersion, "test-v1");
    assert.equal(state.allowlist[0]?.sellerId, "neverdown-rpc");
  });

  it("fails when allowlist missing", () => {
    assert.throws(
      () => loadPolicyState({ POLICY_CAP_TINYBARS: "1" }),
      (e) => e instanceof PolicyConfigError && e.envVar === "POLICY_ALLOWLIST",
    );
  });
});
