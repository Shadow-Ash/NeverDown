/** Read-only validation of the live seller ENS identity. */
import { resolveAndValidateEnsSeller } from "../packages/core/src/ens/resolve.js";

async function main(): Promise<void> {
  const name = process.env.SELLER_ENS_NAME?.trim() || "";
  const payTo = process.env.HEDERA_MERCHANT_ACCOUNT_ID?.trim() || "";
  const sellerUrl = process.env.SELLER_URL?.trim().replace(/\/+$/, "") || "";
  const rpc = process.env.ENS_RPC_URL?.trim() || "";
  const allow = (process.env.ENS_ALLOWLIST_NAMES || "").split(/[,\s;]+/).filter(Boolean);
  if (!name || !payTo || !sellerUrl || !rpc || allow.length === 0) throw new Error("seller ENS configuration incomplete");
  const resolved = await resolveAndValidateEnsSeller(name, payTo, rpc, allow);
  if (resolved.records.x402Url?.replace(/\/+$/, "") !== sellerUrl) throw new Error("ENS x402Url differs from SELLER_URL");
  console.log(`ENS seller verified: ${resolved.normalizedEnsName}`);
}

main().catch((error: unknown) => {
  console.error(`ENS check failed: ${error instanceof Error && "code" in error ? String(error.code) : "lookup error"}`);
  process.exitCode = 1;
});
