import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { PrivateKey, createClientHederaSigner } from "@x402/hedera";

export type HederaBuyerCredentials = {
  accountId: string;
  privateKey: string;
  network?: "hedera:testnet";
  maxPaymentTinybars?: string;
};

/**
 * Build an HTTP x402 client registered for Hedera exact payments.
 * PrivateKey is imported from `@x402/hedera` re-exports to avoid duplicate SDK installs.
 */
export function createHederaX402HttpClient(creds: HederaBuyerCredentials): x402HTTPClient {
  const network = creds.network ?? "hedera:testnet";
  const key = PrivateKey.fromString(creds.privateKey);
  const signer = createClientHederaSigner(creds.accountId, key, { network });
  const core = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
  // Enable explicit SDK spend controls instead of disabling them entirely.
  const maxPayment = creds.maxPaymentTinybars ?? process.env.POLICY_CAP_TINYBARS ?? process.env.HEDERA_X402_PRICE_SMALLEST_UNITS ?? "10000";
  core.setSpendControls({
    maxAmountPerPayment: maxPayment,
    allowedAssets: [{ network, asset: "0.0.0", maxAmountPerPayment: maxPayment }],
  });
  return new x402HTTPClient(core);
}
