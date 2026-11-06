/** Canonical form used for allowlist comparison: origin + path, no trailing slash. */
export function normalizeEndpoint(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    return undefined;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
