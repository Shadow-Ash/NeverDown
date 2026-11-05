import type { GatewayConfig } from "./config.js";
import { probeRpcProvider, type ProbeResult } from "./health.js";

export type ProviderStatus = {
  id: string;
  url: string;
  healthy: boolean;
  healthySince: number | null;
  lastCheckAt: number | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  chainId: number | null;
  blockNumber: number | null;
  lastKnownBlockNumber: number | null;
  latencyMs: number | null;
  reason: string | null;
  lastError: string | null;
};

export type GatewayEvent = {
  id: string;
  timestamp: string;
  providerId: string | null;
  incidentId: string;
  reason: string;
  oldActive: string | null;
  newActive: string | null;
  verificationResult: "pass" | "fail";
  detail: string;
};

export type RoutingMode = "normal" | "failover" | "degraded" | "unavailable";

export class GatewayController {
  readonly config: GatewayConfig;
  private providerStatus = new Map<string, ProviderStatus>();
  private referenceBlock: number | null = null;
  private activeId: string | null = null;
  private readonly history: GatewayEvent[] = [];
  private incidentSeq = 0;
  private startedAt = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private cooldownUntil = 0;
  private probeRunning = false;

  constructor(config: GatewayConfig) {
    this.config = config;
    for (const provider of config.providers) {
      this.providerStatus.set(provider.id, {
        id: provider.id,
        url: provider.url,
        healthy: false,
        healthySince: null,
        lastCheckAt: null,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        chainId: null,
        blockNumber: null,
        lastKnownBlockNumber: null,
        latencyMs: null,
        reason: null,
        lastError: null,
      });
    }
    const first = config.providers[0];
    this.activeId = first ? first.id : null;
  }

  getStatus(providerId: string): ProviderStatus | undefined {
    return this.providerStatus.get(providerId);
  }

  activeProvider(): string | null {
    return this.activeId;
  }

  activeProviderUrl(): string | null {
    const provider = this.config.providers.find((p) => p.id === this.activeId);
    return provider?.url ?? null;
  }

  routingMode(): RoutingMode {
    const active = this.activeId ? this.providerStatus.get(this.activeId) : undefined;
    if (!active || !active.healthy) {
      return this.config.providers.some((p) => this.providerStatus.get(p.id)?.healthy) ? "failover" : "unavailable";
    }
    if (this.config.providers.length < 2) return "degraded";
    return (this.activeId === "primary" ? "normal" : "failover");
  }

  uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  recentEvents(limit = 50): GatewayEvent[] {
    return this.history.slice(-Math.max(1, Math.min(limit, 200)));
  }

  recentEventsObservable(limit = 20): { timestamp: string; providerId: string | null; reason: string; newActive: string | null }[] {
    return this.recentEvents(limit).map((e) => ({
      timestamp: e.timestamp,
      providerId: e.providerId,
      reason: e.reason,
      newActive: e.newActive,
    }));
  }

  async probeOnce(): Promise<void> {
    if (this.probeRunning) return;
    this.probeRunning = true;
    try {
      const now = Date.now();
      const results = new Map<string, ProbeResult>();

      for (const provider of this.config.providers) {
        const current = this.providerStatus.get(provider.id)!;
        const result = await probeRpcProvider(
          provider.url,
          this.config.chainId,
          this.config.requestTimeoutMs,
          this.referenceBlock,
          this.config.staleBlockTolerance,
        );
        results.set(provider.id, result);

        current.lastCheckAt = now;
        current.latencyMs = result.latencyMs;
        current.chainId = result.chainId;
        current.blockNumber = result.blockNumber;
        current.reason = result.reason;
        current.lastError = result.error;

        if (result.healthy) {
          current.consecutiveSuccesses += 1;
          current.consecutiveFailures = 0;
          if (result.blockNumber !== null && (this.referenceBlock === null || result.blockNumber > this.referenceBlock)) {
            this.referenceBlock = result.blockNumber;
          }
          if (current.healthy) {
            current.healthySince = current.healthySince ?? now;
          } else if (
            (current.consecutiveFailures === 0 && current.consecutiveSuccesses >= 1) ||
            (current.consecutiveSuccesses >= this.config.recoveryThreshold)
          ) {
            current.healthy = true;
            current.healthySince = now;
          }
        } else {
          current.consecutiveFailures += 1;
          current.consecutiveSuccesses = 0;
          if (current.consecutiveFailures >= this.config.failureThreshold && current.healthy) {
            current.healthy = false;
            current.healthySince = null;
          } else if (!current.healthy && current.consecutiveFailures >= this.config.failureThreshold) {
            current.healthy = false;
          }
        }


      }
      // Failover logic
      const activeStatus = this.activeId ? this.providerStatus.get(this.activeId) : undefined;
      const activeUnhealthy = !activeStatus || !activeStatus.healthy;
      const alternate = this.config.providers.find((p) => p.id !== this.activeId && this.providerStatus.get(p.id)?.healthy);

      if (activeUnhealthy && alternate) {
        if (now >= this.cooldownUntil) {
          const oldActive = this.activeId;
          this.activeId = alternate.id;
          this.cooldownUntil = now + this.config.failoverCooldownMs;
          this.logEvent(
            alternate.id,
            "failover completed",
            oldActive,
            this.activeId,
            "pass",
            activeStatus?.reason ? `previous=${activeStatus.id}` : "active provider unhealthy",
          );
        }
      }

      // Failback logic: return to primary only after cooldown + recovery threshold.
      const primaryStatus = this.providerStatus.get("primary");
      const activeIsStandby = this.activeId === "standby";
      if (
        this.config.providers.length > 1 &&
        activeIsStandby &&
        primaryStatus?.healthy &&
        (primaryStatus.consecutiveSuccesses >= this.config.recoveryThreshold) &&
        now >= this.cooldownUntil
      ) {
        const oldActive = this.activeId;
        this.activeId = "primary";
        this.cooldownUntil = now + this.config.failoverCooldownMs;
        this.logEvent("primary", "failback completed", oldActive, this.activeId, "pass", "primary recovered");
      }
    } finally {
      this.probeRunning = false;
    }
  }

  start(): void {
    if (this.timer) return;
    void this.probeOnce();
    this.timer = setInterval(() => {
      void this.probeOnce();
    }, this.config.healthIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async forwardJsonRpc(body: unknown, _requestId?: string): Promise<{ ok: boolean; status: number; json: unknown }> {
    const payload = body as Record<string, unknown>;

    const multiple =
      Array.isArray(body) || typeof body !== "object" || body === null ||
      payload.jsonrpc !== "2.0" ||
      typeof payload.method !== "string";

    if (multiple || !("id" in payload) || ("params" in payload && !(Array.isArray(payload.params)))) {
      return {
        ok: false,
        status: 400,
        json: { jsonrpc: "2.0", id: null as number | null, error: { code: -32600, message: "Invalid Request" } },
      };
    }

    if (Array.isArray(body)) {
      return {
        ok: false,
        status: 400,
        json: { jsonrpc: "2.0", id: null as number | null, error: { code: -32600, message: "batch requests are not supported" } },
      };
    }

    const method = payload.method as string;
    const allowed = ["eth_chainId", "eth_blockNumber", "net_version"];
    if (!allowed.includes(method)) {
      return { ok: false, status: 400, json: { jsonrpc: "2.0", id: (payload.id as unknown) ?? null, error: { code: -32601, message: "Method not found or not allowed" } } };
    }

    const id = payload.id;

    const attempt = async (providerId: string): Promise<{ ok: boolean; status: number; json: unknown }> => {
      const provider = this.config.providers.find((p) => p.id === providerId);
      if (!provider) throw new Error("unknown provider");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const res = await fetch(provider.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
          redirect: "error",
        });
        const text = await res.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch {
          json = { jsonrpc: "2.0", id, error: { code: -32603, message: "invalid upstream response" } };
        }
        if (!res.ok) {
          return { ok: false, status: res.status, json: { jsonrpc: "2.0", id, error: { code: -32603, message: "upstream HTTP error" } } };
        }
        return { ok: true, status: 200, json };
      } finally {
        clearTimeout(timer);
      }
    };

    const bind = attempt;

    const activeId = this.activeId;
    if (activeId) {
      const status = this.providerStatus.get(activeId);
      if (!status || !status.healthy) {
        // try a healthy alternate once
        const alt = this.config.providers.find((p) => p.id !== activeId && this.providerStatus.get(p.id)?.healthy);
        if (alt) {
          const r = await bind(alt.id);
          if (r.ok) return r;
        }
      } else {
        try {
          const r = await bind(activeId);
          if (r.ok) return r;
        } catch (e) {
          // retry on alternate if safe method
        }
        if (allowed.includes(method)) {
          const alt = this.config.providers.find((p) => p.id !== activeId && this.providerStatus.get(p.id)?.healthy);
          if (alt) {
            const r = await bind(alt.id);
            return r;
          }
        }
      }
    }

    // No healthy provider
    return {
      ok: false,
      status: 502,
      json: { jsonrpc: "2.0", id, error: { code: -32603, message: "upstream unavailable" } },
    };
  }

  installStandby(_request: unknown): { ok: boolean; status: number; body: unknown } {
    return { ok: false, status: 501, body: { error: "not implemented in C4" } };
  }

  snapshot() {
    const events = this.recentEvents(50).map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      providerId: e.providerId,
      incidentId: e.incidentId,
      reason: e.reason,
      oldActive: e.oldActive,
      newActive: e.newActive,
      verificationResult: e.verificationResult,
    }));
    return {
      uptimeMs: this.uptimeMs(),
      providers: this.config.providers.map((p) => {
        const s = this.providerStatus.get(p.id)!;
        return {
          id: p.id,
          healthy: s.healthy,
          lastCheckAt: s.lastCheckAt,
          consecutiveSuccesses: s.consecutiveSuccesses,
          consecutiveFailures: s.consecutiveFailures,
          chainId: s.chainId,
          blockNumber: s.blockNumber,
          latencyMs: s.latencyMs,
          reason: s.reason,
        };
      }),
      active: this.activeId,
      routingMode: this.routingMode(),
      referenceBlock: this.referenceBlock,
      recentEvents: events,
      redundancy: this.config.providers.length > 1,
    };
  }

  private logEvent(providerId: string | null, reason: string, oldActive: string | null, newActive: string | null, verificationResult: "pass" | "fail", detail: string) {
    const incidentId = `INC-${++this.incidentSeq}`;
    this.history.push({
      id: `EVT-${this.history.length + 1}`,
      timestamp: new Date().toISOString(),
      providerId,
      incidentId,
      reason,
      oldActive,
      newActive,
      verificationResult,
      detail,
    });
    if (this.history.length > 200) this.history.shift();
  }
}

// Guard: request body size handled by caller middleware.
export function describeGatewayInternalInterface() {
  return 'internal-only standby install interface; disabled unless enabled and authenticated';
}
