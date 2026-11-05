import {
  AccountId,
  Client,
  PrivateKey,
} from "@hiero-ledger/sdk";
import type { HederaOperator } from "./types.js";

/**
 * Build a testnet Client signed by the HCS operator.
 * Uses @hiero-ledger/sdk directly (topic APIs are not re-exported by @x402/hedera).
 */
export function createOperatorClient(operator: HederaOperator): Client {
  const network = operator.network ?? "testnet";
  if (network !== "testnet") {
    throw new Error("HCS client is testnet-only for C3");
  }
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(operator.accountId),
    PrivateKey.fromString(operator.privateKey),
  );
  return client;
}
