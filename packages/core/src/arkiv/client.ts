import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArkivConfig } from "./config.js";

export function createArkivPublicClient(config: ArkivConfig) {
  return createPublicClient({
    chain: rabdi({ accessKey: config.accessKey }),
    transport: http(),
  });
}

export function createArkivWalletClient(config: ArkivConfig) {
  if (!config.privateKey) {
    throw new Error("ARKIV_PRIVATE_KEY required for wallet client");
  }
  const account = privateKeyToAccount(config.privateKey);
  return {
    account,
    client: createWalletClient({
      account,
      chain: rabdi({ accessKey: config.accessKey }),
      transport: http(),
    }),
  };
}
