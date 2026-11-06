/**
 * Set NeverDown seller text records on ENS (ENSv1 classic or ENSv2 via Universal Resolver).
 * Requires ENS_OWNER_PRIVATE_KEY (controller/owner) — never commit it.
 *
 *   ENS_OWNER_PRIVATE_KEY=0x... pnpm ens:set-texts
 */
import { Contract, Interface, JsonRpcProvider, Wallet, namehash } from "ethers";
import { dnsEncodeName, UNIVERSAL_RESOLVER_ADDRESS } from "../packages/core/src/ens/resolve.js";

const RESOLVER_ABI = [
  "function setText(bytes32 node, string key, string value) external",
  "function text(bytes32 node, string key) view returns (string)",
];

const ALLOWED_ENS_CHAIN_IDS = new Set([1n, 11155111n]);

async function findResolverAddress(provider: JsonRpcProvider, name: string): Promise<string> {
  const classic = await provider.getResolver(name);
  if (classic?.address) return classic.address;

  const ur = new Contract(
    UNIVERSAL_RESOLVER_ADDRESS,
    ["function resolve(bytes name, bytes data) view returns (bytes, address)"],
    provider,
  );
  const data = new Interface(["function addr(bytes32) view returns (address)"]).encodeFunctionData("addr", [namehash(name)]);
  const [, resolver] = await ur.resolve.staticCall(dnsEncodeName(name), data);
  if (!resolver || resolver === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No resolver for ${name}`);
  }
  return String(resolver);
}

async function main(): Promise<void> {
  const name = (process.env.SELLER_ENS_NAME || "neverdownseller.eth").trim().toLowerCase();
  const rpc = process.env.ENS_RPC_URL?.trim() || "https://ethereum-rpc.publicnode.com";
  const key = process.env.ENS_OWNER_PRIVATE_KEY?.trim();
  const hedera = process.env.ENS_TEXT_hederaAccount?.trim() || process.env.HEDERA_MERCHANT_ACCOUNT_ID?.trim();
  const x402 = process.env.ENS_TEXT_x402Url?.trim() || process.env.SELLER_URL?.trim() || "http://localhost:4001";
  if (!key) throw new Error("ENS_OWNER_PRIVATE_KEY required");
  if (!hedera) throw new Error("ENS_TEXT_hederaAccount or HEDERA_MERCHANT_ACCOUNT_ID required");

  const provider = new JsonRpcProvider(rpc);
  const network = await provider.getNetwork();
  if (!ALLOWED_ENS_CHAIN_IDS.has(network.chainId)) {
    throw new Error("ENS_RPC_URL must be Ethereum Sepolia (11155111) or mainnet (1)");
  }
  const wallet = new Wallet(key, provider);
  const resolverAddress = await findResolverAddress(provider, name);
  const nodeHash = namehash(name);
  const contract = new Contract(resolverAddress, RESOLVER_ABI, wallet);
  console.log(`Setting texts on ${name} (chain ${network.chainId}) via ${resolverAddress} from ${wallet.address}`);
  const tx1 = await contract.setText(nodeHash, "hederaAccount", hedera);
  console.log("hederaAccount tx", tx1.hash);
  await tx1.wait();
  const tx2 = await contract.setText(nodeHash, "x402Url", x402.replace(/\/+$/, ""));
  console.log("x402Url tx", tx2.hash);
  await tx2.wait();
  const tx3 = await contract.setText(nodeHash, "category", "rpc");
  console.log("category tx", tx3.hash);
  await tx3.wait();
  console.log("Done. Run: pnpm ens:check");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
