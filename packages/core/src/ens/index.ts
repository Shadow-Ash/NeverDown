export { loadEnsConfig } from "./config.js";
export type { EnsConfig } from "./config.js";
export {
  createEnsProvider,
  resolveEnsSeller,
  requireEnsAllowed,
  validateResolvedSeller,
  resolveAndValidateEnsSeller,
  EnsResolutionError,
} from "./resolve.js";
export type { EnsTextRecords, EnsSellerResolution } from "./resolve.js";
