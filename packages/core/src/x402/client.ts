import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { PrivateKey, createClientHederaSigner } from "@x402/hedera";

export type HederaBuyerCredentials = {
  accountId: string;
  privateKey: string;
  network?: "hedera:testnet";
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
  return new x402HTTPClient(core);
}
