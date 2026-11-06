import assert from "node:assert/strict";
import { it } from "node:test";
import { parsePurchaseRequest } from "../src/payment-worker/protocol.js";

it("accepts nonsecret selected-offer terms and rejects a foreign purchase URL", () => {
  const valid = { purchaseId: "p1", serviceId: "rpc-pack", endpoint: "https://seller.example", purchaseUrl: "https://seller.example/rpc-pack", expectedPayTo: "0.0.4242", expectedAmountTinybars: "10000", offerEntityKey: "0xabc" };
  assert.deepEqual(parsePurchaseRequest(valid), valid);
  assert.throws(() => parsePurchaseRequest({ ...valid, purchaseUrl: "https://evil.example/rpc-pack" }), /purchaseUrl/);
  assert.throws(() => parsePurchaseRequest({ ...valid, expectedAmountTinybars: "0" }), /amount/);
});
