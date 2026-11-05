/**
 * @neverdown/core — public surface.
 * C2: Hedera x402 buyer. Later chunks add policy, Arkiv, ENS, agent.
 */
export const NEVERDOWN_VERSION = "0.0.0";

export function neverdownIdentity(): string {
  return "NeverDown";
}

export * from "./x402/index.js";
export * from "./policy/index.js";
export * from "./hcs/index.js";
