import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntitlementStore } from "../src/entitlement.js";

it("entitlement remains unusable until settlement and expires or exhausts", () => {
  let now = 1_000_000;
  const store = new EntitlementStore(":memory:", () => now);
  try {
    const token = store.issuePending(2, 60_000);
    assert.equal(store.consume(token), false);
    store.activate(token);
    assert.equal(store.consume(token), true);
    assert.equal(store.consume(token), true);
    assert.equal(store.consume(token), false);
    const other = store.issuePending(2, 60_000);
    store.activate(other);
    now += 60_001;
    assert.equal(store.consume(other), false);
    assert.equal(store.consume("invalid"), false);
  } finally { store.close(); }
});

it("persists active usage across seller restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "neverdown-entitlement-"));
  const path = join(dir, "seller.sqlite");
  try {
    const first = new EntitlementStore(path);
    const token = first.issuePending(2, 60_000);
    first.activate(token);
    assert.equal(first.consume(token), true);
    first.close();
    const second = new EntitlementStore(path);
    assert.equal(second.consume(token), true);
    assert.equal(second.consume(token), false);
    second.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
