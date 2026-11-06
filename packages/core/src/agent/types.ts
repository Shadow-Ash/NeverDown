import type { CapabilityOfferRow } from "../arkiv/schema.js";
import type { EnsSellerResolution } from "../ens/resolve.js";
import type { ProofOfCapabilityResult } from "../poc/types.js";
export type AgentScenario = "procure" | "deny";

export type AgentPurchaseResult = {
  approved: boolean;
  denyReason?: string;
  message?: string;
  transactionId?: string;
  settled?: boolean;
  status?: "SETTLED" | "DENIED" | "RELEASED" | "UNCERTAIN";
  /** Internal handoff only; never put this in an evidence receipt. */
  entitlementToken?: string;
};

export type AgentToolName =
  | "discover_offers"
  | "resolve_seller"
  | "proof_of_capability"
  | "request_purchase"
  | "install_standby"
  | "force_bad_purchase";

export type AgentStep = {
  tool: AgentToolName;
  ok: boolean;
  at: string;
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type EvidenceReceipt = {
  schemaVersion: "neverdown-evidence-v1";
  scenario: AgentScenario;
  success: boolean;
  objective: string;
  steps: AgentStep[];
  selectedOffer?: CapabilityOfferRow | null;
  ens?: EnsSellerResolution | null;
  poc?: ProofOfCapabilityResult | null;
  purchase?: Omit<AgentPurchaseResult, "entitlementToken"> | null;
  standbyInstall?: unknown;
  denyReason?: string;
  notes: string[];
};

export type DiscoverOffersTool = (input: {
  category: string;
  maxPriceTinybars: string | number | bigint;
}) => Promise<CapabilityOfferRow[]>;

export type ResolveSellerTool = (input: {
  ensName: string;
  expectedPayTo: string;
}) => Promise<EnsSellerResolution>;

export type ProofOfCapabilityTool = (input: {
  rpcUrl: string;
  expectedChainId: number | string;
  payTo: string;
  ensPayTo: string;
}) => Promise<ProofOfCapabilityResult>;

export type RequestPurchaseTool = (input: {
  purchaseId: string;
  serviceId: string;
  sellerUrl: string;
  purchaseUrl?: string;
  offerEntityKey?: string;
  payTo: string;
  amountTinybars: string;
}) => Promise<AgentPurchaseResult>;

export type InstallStandbyTool = (input: { rpcUrl: string; probeUrl?: string; entitlementToken?: string }) => Promise<{ installed: boolean; detail: unknown }>;

export type ForceBadPurchaseTool = (input: {
  purchaseId: string;
  serviceId: string;
  badPayTo: string;
  amountTinybars: string;
}) => Promise<{ approved: boolean; denyReason?: string; message?: string }>;

export type AgentToolBelt = {
  discover_offers: DiscoverOffersTool;
  resolve_seller: ResolveSellerTool;
  proof_of_capability: ProofOfCapabilityTool;
  request_purchase: RequestPurchaseTool;
  install_standby: InstallStandbyTool;
  force_bad_purchase: ForceBadPurchaseTool;
};
