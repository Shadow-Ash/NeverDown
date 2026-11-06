import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectLiveConfiguration, checkRpcChainId } from "../src/agent/preflight.js";

it("accepts an isolated worker configuration without exposing values", () => {
  const dir = mkdtempSync(join(tmpdir(), "nd-preflight-"));
  const file = join(dir, ".env.worker");
  writeFileSync(file, [
    "HEDERA_SPEND_ID=0.0.1111", "HEDERA_SPEND_KEY=dummy-key", "HEDERA_OPERATOR_ID=0.0.2222",
    "HEDERA_OPERATOR_KEY=dummy-key", "HEDERA_TOPIC_ID=0.0.3333", "POLICY_ALLOWLIST=0.0.4444",
    "POLICY_ENDPOINTS=http://localhost:4001", "POLICY_MAX_PER_PAYMENT_TINYBARS=10000",
    "POLICY_TOTAL_BUDGET_TINYBARS=30000", "POLICY_DB_PATH=/tmp/nd-policy-test.sqlite",
  ].join("\n"));
  chmodSync(file, 0o600);
  try {
    const env = {
      PAYMENT_WORKER_ENV_FILE: file, ENS_RPC_URL: "https://ethereum.example",
      ENS_ALLOWLIST_NAMES: "seller.example.eth", SELLER_ENS_NAME: "seller.example.eth",
      SELLER_URL: "http://localhost:4001", HEDERA_MERCHANT_ACCOUNT_ID: "0.0.4444",
      HEDERA_X402_PRICE_SMALLEST_UNITS: "10000", POC_EXPECTED_CHAIN_ID: "11155111",
      POC_REFERENCE_RPC: "https://sepolia.example", GATEWAY_INTERNAL_API: "true",
      GATEWAY_INTERNAL_TOKEN: "long-private-token-1234567890", GATEWAY_PRIMARY_RPC_URL: "https://primary.example",
      GATEWAY_STANDBY_RPC_URL: "https://standby.example", ARKIV_ACCESS_KEY: "access-key",
    };
    const issues = inspectLiveConfiguration(env);
    assert.deepEqual(issues, []);
    appendFileSync(file, "\nHCS_AUDIT_AVAILABILITY=BEST_EFFORT\n");
    assert.ok(inspectLiveConfiguration(env).some((x) => x.includes("HCS_AUDIT_AVAILABILITY")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("rejects parent signing keys and missing independent PoC without leaking them", () => {
  const issues = inspectLiveConfiguration({ HEDERA_SPEND_KEY: "very-secret-key" });
  assert.ok(issues.some((x) => x.includes("HEDERA_SPEND_KEY")));
  assert.ok(issues.some((x) => x.includes("POC_REFERENCE_RPC")));
  assert.ok(!JSON.stringify(issues).includes("very-secret-key"));
});

it("rejects a reference RPC that is the seller upstream", () => {
  const issues = inspectLiveConfiguration({ POC_REFERENCE_RPC: "https://rpc.example", RPC_UPSTREAM_URL: "https://rpc.example" });
  assert.ok(issues.some((x) => x.includes("independent")));
});

it("rejects a world-readable worker file before loading its values", () => {
  const dir = mkdtempSync(join(tmpdir(), "nd-preflight-mode-"));
  const file = join(dir, ".env.worker");
  writeFileSync(file, "HEDERA_SPEND_KEY=private-key\n", { mode: 0o644 });
  chmodSync(file, 0o644);
  try {
    const issues = inspectLiveConfiguration({ PAYMENT_WORKER_ENV_FILE: file });
    if (process.platform !== "win32") assert.ok(issues.some((x) => x.includes("0600")));
    assert.ok(!JSON.stringify(issues).includes("private-key"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("rejects a reachable RPC on the wrong chain", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x76edaf" }), { status: 200 });
  await assert.rejects(() => checkRpcChainId("https://rpc.example", "0xaa36a7", fakeFetch), /wrong chain/);
});
