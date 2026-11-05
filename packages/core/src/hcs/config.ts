export type HcsConfig = {
  topicId: string;
  operatorId: string;
  operatorKey: string;
  mirrorNodeUrl: string;
  availability: "REQUIRED_DURABLE" | "BEST_EFFORT";
};

export function loadHcsConfig(env: NodeJS.ProcessEnv = process.env): HcsConfig | undefined {
  const topicId = env.HEDERA_TOPIC_ID?.trim();
  const operatorId = env.HEDERA_OPERATOR_ID?.trim();
  const operatorKey = env.HEDERA_OPERATOR_KEY?.trim();
  if (!topicId || !operatorId || !operatorKey) return undefined;
  const availabilityRaw = env.HCS_AUDIT_AVAILABILITY?.trim().toUpperCase() || "REQUIRED_DURABLE";
  if (availabilityRaw !== "REQUIRED_DURABLE" && availabilityRaw !== "BEST_EFFORT") {
    throw new Error("HCS_AUDIT_AVAILABILITY must be REQUIRED_DURABLE or BEST_EFFORT");
  }
  return {
    topicId,
    operatorId,
    operatorKey,
    mirrorNodeUrl: env.HEDERA_MIRROR_NODE_URL?.trim() || "https://testnet.mirrornode.hedera.com",
    availability: availabilityRaw as "REQUIRED_DURABLE" | "BEST_EFFORT",
  };
}