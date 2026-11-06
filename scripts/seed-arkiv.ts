/**
 * C5: seed NeverDown capability offers on Arkiv Rabdi testnet.
 *
 * Requires ARKIV_PRIVATE_KEY (+ ARKIV_ACCESS_KEY recommended).
 * Fund the wallet at https://hub.arkiv.network/faucet
 * Access key: https://hub.arkiv.network/access-keys
 *
 * Run: pnpm arkiv:seed
 */
import { ArkivConfigError, loadArkivWriteConfig } from "../packages/core/src/arkiv/config.js";
import { createArkivWalletClient } from "../packages/core/src/arkiv/client.js";
import { liveSeedSpec, seedCapabilityOffers } from "../packages/core/src/arkiv/seed.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadArkivWriteConfig(process.env);
  } catch (err) {
    if (err instanceof ArkivConfigError) {
      console.error(`Config error${err.envVar ? ` (${err.envVar})` : ""}: ${err.message}`);
      console.error("Get an access key: https://hub.arkiv.network/access-keys");
      console.error("Fund tGLM: https://hub.arkiv.network/faucet");
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const { account } = createArkivWalletClient(config);
  console.log(`Writer wallet: ${account.address}`);
  console.log(`Access key: ${config.accessKey ? "set" : "empty (public RPC — may rate-limit)"}`);
  const spec = liveSeedSpec(process.env);
  console.log(`Seeding ${spec.sellerens} at ${spec.serviceurl} …`);

  const seeded = await seedCapabilityOffers({ config, specs: [spec] });
  for (const row of seeded) {
    console.log(
      `${row.label}: entityKey=${row.entityKey} payto=${row.payto} price=${row.pricetinybars} tx=${row.txHash}`,
    );
  }
  console.log("Explorer: https://rabdi.explorer.arkiv.network");
  console.log("Next: pnpm arkiv:query");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
