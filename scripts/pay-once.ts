/**
 * C2 live gate: pay the local NeverDown sellers merchant once on Hedera testnet.
 *
 * Prerequisites:
 * - `HEDERA_SPEND_ID` + `HEDERA_SPEND_KEY` set in root `.env` (funded testnet account)
 * - Sellers running: `pnpm --filter @neverdown/sellers dev`
 *
 * Run: `pnpm pay:once`
 */
import {
  BuyerConfigError,
  PayOnceError,
  loadBuyerConfig,
  payForRpcOnceWithConfig,
} from "../packages/core/src/x402/index.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadBuyerConfig(process.env);
  } catch (err) {
    if (err instanceof BuyerConfigError) {
      console.error(`Config error${err.envVar ? ` (${err.envVar})` : ""}: ${err.message}`);
      console.error(
        "Fill HEDERA_SPEND_ID and HEDERA_SPEND_KEY in .env (Hedera testnet faucet: https://portal.hedera.com/), then retry.",
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log(`Seller: ${config.sellerUrl}`);
  console.log(`Spend account: ${config.spendAccountId}`);
  console.log("Requesting unpaid POST /rpc …");

  try {
    const result = await payForRpcOnceWithConfig(config);
    console.log("JSON-RPC result:", result.rpcResult);
    console.log("Hedera transactionId:", result.transactionId);
    console.log("HashScan:", result.hashscanUrl);
    if (!result.settle.success) {
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof PayOnceError || err instanceof Error) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
