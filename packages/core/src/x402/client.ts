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
  // HBAR (0.0.0) is not a USD "default asset", so spendControls must allow it explicitly.
  const core = x402Client.fromConfig({
    schemes: [{ network: "hedera:*", client: new ExactHederaScheme(signer) }],
    spendControls: {
      allowedAssets: [
        {
          network: "hedera:testnet",
          asset: "0.0.0",
          // 1 HBAR in tinybars — well above C1 price (10000 tinybars)
          maxAmountPerPayment: "100000000",
        },
      ],
    },
  });
  return new x402HTTPClient(core);
}
