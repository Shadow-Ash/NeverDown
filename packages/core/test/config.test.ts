import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BuyerConfigError, loadBuyerConfig } from "../src/x402/config.js";

describe("loadBuyerConfig", () => {
  it("loads spend credentials and default seller URL", () => {
    const cfg = loadBuyerConfig({
      HEDERA_SPEND_ID: "0.0.1111",
      HEDERA_SPEND_KEY: "302e020100300506032b657004220420aabb",
    });
    assert.equal(cfg.spendAccountId, "0.0.1111");
    assert.equal(cfg.network, "hedera:testnet");
    assert.equal(cfg.sellerUrl, "http://localhost:4001");
    assert.ok(cfg.spendPrivateKey.length > 0);
  });

  it("accepts hedera:testnet as HEDERA_NETWORK", () => {
    const cfg = loadBuyerConfig({
      HEDERA_NETWORK: "hedera:testnet",
      HEDERA_SPEND_ID: "0.0.1111",
      HEDERA_SPEND_KEY: "secret",
      SELLER_URL: "http://127.0.0.1:4001/",
    });
    assert.equal(cfg.sellerUrl, "http://127.0.0.1:4001");
  });

  it("fails when HEDERA_SPEND_ID is missing", () => {
    assert.throws(
      () => loadBuyerConfig({ HEDERA_SPEND_KEY: "secret" }),
      (err: unknown) =>
        err instanceof BuyerConfigError && err.envVar === "HEDERA_SPEND_ID",
    );
  });

  it("fails when HEDERA_SPEND_KEY is missing", () => {
    assert.throws(
      () => loadBuyerConfig({ HEDERA_SPEND_ID: "0.0.1111" }),
      (err: unknown) =>
        err instanceof BuyerConfigError && err.envVar === "HEDERA_SPEND_KEY",
    );
  });

  it("rejects mainnet", () => {
    assert.throws(
      () =>
        loadBuyerConfig({
          HEDERA_NETWORK: "mainnet",
          HEDERA_SPEND_ID: "0.0.1111",
          HEDERA_SPEND_KEY: "secret",
        }),
      (err: unknown) => err instanceof BuyerConfigError && err.envVar === "HEDERA_NETWORK",
    );
  });

  it("rejects malformed spend account id", () => {
    assert.throws(
      () =>
        loadBuyerConfig({
          HEDERA_SPEND_ID: "bad",
          HEDERA_SPEND_KEY: "secret",
        }),
      (err: unknown) => err instanceof BuyerConfigError && err.envVar === "HEDERA_SPEND_ID",
    );
  });
});
