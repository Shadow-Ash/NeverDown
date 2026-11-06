/**
 * C5: query live NeverDown capability offers on Arkiv.
 *
 * Run: pnpm arkiv:query
 */
import { ArkivConfigError } from "../packages/core/src/arkiv/config.js";
import { discoverOffers } from "../packages/core/src/arkiv/discover.js";
import { loadArkivReadConfig } from "../packages/core/src/arkiv/config.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadArkivReadConfig(process.env);
  } catch (err) {
    if (err instanceof ArkivConfigError) {
      console.error(`Config error${err.envVar ? ` (${err.envVar})` : ""}: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const maxPrice = BigInt(process.env.HEDERA_X402_PRICE_SMALLEST_UNITS?.trim() || "20000");
  console.log(`discoverOffers category=rpc maxPrice=${maxPrice}`);
  const offers = await discoverOffers({
    category: "rpc",
    maxPriceTinybars: maxPrice,
    config,
  });

  if (offers.length === 0) {
    console.error("No live offers found. Run pnpm arkiv:seed first.");
    process.exitCode = 1;
    return;
  }

  for (const o of offers) {
    console.log(
      `entityKey=${o.entityKey} sellerens=${o.sellerens} payto=${o.payto} price=${o.pricetinybars} url=${o.serviceurl}`,
    );
  }
  console.log(`Live offers: ${offers.length}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
