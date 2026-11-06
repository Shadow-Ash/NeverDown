import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { HcsEvent } from "./types.js";

export function canonicalize(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function signEvent(event: HcsEvent, key: string | undefined): string | undefined {
  if (!key) return undefined;
  return createHmac("sha256", key).update(canonicalize(event)).digest("hex");
}

export function verifyEventSignature(event: HcsEvent, signature: string | undefined, key: string | undefined): boolean {
  if (!signature) return key === undefined;
  if (!key) return false;
  const expected = createHmac("sha256", key).update(canonicalize(event)).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function safePayload(event: HcsEvent): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event));
}