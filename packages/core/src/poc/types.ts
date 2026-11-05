export type PocCheckName =
  | "chainId"
  | "freshness"
  | "smoke"
  | "latency"
  | "payToMatch";

export type PocCheckResult = {
  name: PocCheckName;
  pass: boolean;
  detail: string;
  observed?: string | number | null;
  expected?: string | number | null;
  latencyMs?: number;
};

export type ProofOfCapabilityInput = {
  /** Candidate RPC URL to verify (capability endpoint). */
  rpcUrl: string;
  expectedChainId: number | string;
  /** Hedera payTo from offer / challenge */
  payTo: string;
  /** Hedera account from ENS text record `hederaAccount` */
  ensPayTo: string;
  /**
   * Independent RPC used as freshness reference.
   * Defaults to `POC_REFERENCE_RPC` or the candidate itself (self-compare then only checks monotonicity).
   */
  referenceRpcUrl?: string;
  /** Max allowed lag in blocks vs reference (default 20). */
  staleBlockTolerance?: number;
  /** Max end-to-end latency for smoke call in ms (default 3000). */
  maxLatencyMs?: number;
  fetchImpl?: typeof fetch;
};

export type ProofOfCapabilityResult = {
  pass: boolean;
  checks: PocCheckResult[];
  candidateChainId?: string;
  candidateBlockNumber?: number;
  referenceBlockNumber?: number;
  latencyMs?: number;
};
