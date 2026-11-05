import type { AuditEvent } from "./types.js";

const DEFAULT_MIRROR = "https://testnet.mirrornode.hedera.com";

export type MirrorTopicMessage = {
  consensus_timestamp: string;
  sequence_number: number;
  message: string; // base64
};

export type DecodedAuditMessage = {
  sequenceNumber: number;
  consensusTimestamp: string;
  event: AuditEvent;
};

function decodeMessage(raw: MirrorTopicMessage): DecodedAuditMessage | null {
  try {
    const json = Buffer.from(raw.message, "base64").toString("utf8");
    const event = JSON.parse(json) as AuditEvent;
    if (event?.v !== 1 || (event.type !== "PAY" && event.type !== "DENY")) {
      return null;
    }
    return {
      sequenceNumber: raw.sequence_number,
      consensusTimestamp: raw.consensus_timestamp,
      event,
    };
  } catch {
    return null;
  }
}

/** Fetch recent topic messages from Mirror Node (read-only). */
export async function fetchRecentAuditMessages(
  topicId: string,
  opts: { limit?: number; mirrorBaseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<DecodedAuditMessage[]> {
  const limit = opts.limit ?? 25;
  const base = (opts.mirrorBaseUrl ?? DEFAULT_MIRROR).replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${base}/api/v1/topics/${encodeURIComponent(topicId)}/messages?limit=${limit}&order=desc`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Mirror topic messages failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { messages?: MirrorTopicMessage[] };
  const decoded: DecodedAuditMessage[] = [];
  for (const msg of body.messages ?? []) {
    const item = decodeMessage(msg);
    if (item) decoded.push(item);
  }
  return decoded;
}

export function mirrorTopicUrl(topicId: string): string {
  return `https://hashscan.io/testnet/topic/${encodeURIComponent(topicId)}`;
}
