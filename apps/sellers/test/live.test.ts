import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createApp } from "../src/app.js";
import { decodePaymentRequired, listen, testConfig } from "./helpers.js";

// Opt-in: LIVE_X402=1 pnpm --filter @neverdown/sellers test
// Queries the real facilitator's /supported endpoint and asks the seller for a
// live challenge. It never submits a payment or settles anything.
const live = process.env.LIVE_X402 === "1";
const facilitatorUrl = process.env.X402_FACILITATOR_URL?.trim() || "https://x402.org/facilitator";

describe("LIVE x402 facilitator (opt-in, read-only)", { skip: !live }, () => {
  it("the facilitator advertises an exact hedera:testnet kind with a fee payer", async () => {
    const supported = await new HTTPFacilitatorClient({ url: facilitatorUrl }).getSupported();
    const kind = supported.kinds.find((k) => k.network === "hedera:testnet" && k.scheme === "exact");
    assert.ok(kind, "hedera:testnet exact kind missing from /supported");
    assert.equal(typeof (kind.extra as { feePayer?: unknown } | undefined)?.feePayer, "string");
  });

  it("the seller returns a Hedera testnet 402 challenge built from the live facilitator", async () => {
    const app = createApp({ config: testConfig({ facilitatorUrl }) });
    const srv = await listen(app);
    try {
      const res = await fetch(`${srv.baseUrl}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      assert.equal(res.status, 402);
      const challenge = decodePaymentRequired(res.headers.get("payment-required")!) as {
        accepts: Array<{ network: string; extra?: { feePayer?: string } }>;
      };
      assert.equal(challenge.accepts[0].network, "hedera:testnet");
      assert.equal(typeof challenge.accepts[0].extra?.feePayer, "string");
    } finally {
      await srv.close();
    }
  });
});
