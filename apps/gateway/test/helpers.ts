import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

export type MockState = {
  chainId: number;
  blockNumber: number;
  statusCode: number;
  readDelayMs: number;
  available: boolean;
};

export type MockServer = {
  url: string;
  port: number;
  state: MockState;
  stopped: () => Promise<void>;
};

export async function startMockRpc(initial: Partial<MockState> = {}): Promise<MockServer> {
  const state: MockState = {
    chainId: 11155111,
    blockNumber: 1000,
    statusCode: 200,
    readDelayMs: 0,
    available: true,
    ...initial,
  };

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!state.available) {
        setTimeout(() => {
          res.statusCode = state.statusCode;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "service unavailable" }));
        }, state.readDelayMs);
        return;
      }
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
      const { method, id } = body as { method?: string; id?: number };
      setTimeout(() => {
        res.statusCode = state.statusCode;
        res.setHeader("content-type", "application/json");
        if (state.statusCode >= 400) {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32603, message: "upstream error" } }));
          return;
        }
        if (method === "eth_chainId") {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result: `0x${state.chainId.toString(16)}` }));
        } else if (method === "eth_blockNumber") {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result: `0x${state.blockNumber.toString(16)}` }));
        } else if (method === "net_version") {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result: String(state.chainId) }));
        } else {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: "method not found" } }));
        }
      }, state.readDelayMs);
    });
  });

  const portPromise = new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });
  const port = await portPromise;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    state,
    stopped: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

export function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    port: 0,
    chainId: 11155111,
    providers: [],
    healthIntervalMs: 50,
    requestTimeoutMs: 500,
    failureThreshold: 1,
    recoveryThreshold: 2,
    staleBlockTolerance: 5,
    failoverCooldownMs: 1000,
    internalApiEnabled: false,
    internalToken: undefined,
    ...overrides,
  };
}