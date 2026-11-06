import express, { type NextFunction, type Request, type Response } from "express";
import { HTTPFacilitatorClient, x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { paymentMiddleware } from "@x402/express";
import type { SellerConfig } from "./config.js";
import {
  forwardToUpstream,
  mockResult,
  validateJsonRpc,
  type JsonRpcRequest,
  type JsonRpcId,
} from "./rpc.js";

export interface AppOptions {
  config: SellerConfig;
  facilitatorClient?: FacilitatorClient;
  fetchImpl?: typeof fetch;
  syncFacilitatorOnStart?: boolean;
  onExecute?: (method: string) => void;
}

const RPC_BODY_LIMIT = "16kb";
const PROBE_LIMIT_PER_MINUTE = 120;

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export function createApp(opts: AppOptions): express.Express {
  const { config } = opts;
  const facilitator = opts.facilitatorClient ?? new HTTPFacilitatorClient({ url: config.facilitatorUrl });

  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactHederaScheme(),
  );

  const routes = {
    "POST /rpc": {
      accepts: [
        {
          scheme: "exact",
          network: config.network,
          payTo: config.merchantAccountId,
          price: { asset: config.assetId, amount: config.priceSmallestUnits },
          maxTimeoutSeconds: 60,
        },
      ],
      description: "Paid JSON-RPC access to a NeverDown RPC endpoint",
      mimeType: "application/json",
    },
  };

  const app = express();
  app.disable("x-powered-by");
  let probeWindowStart = Date.now();
  let probeCount = 0;

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "neverdown-rpc-seller", network: config.network });
  });

  // Public proof is deliberately narrow and capped per seller process. It cannot
  // be used as an unrestricted unpaid JSON-RPC proxy.
  app.post("/probe", express.json({ limit: RPC_BODY_LIMIT }), async (req: Request, res: Response) => {
    const result = validateJsonRpc(req.body);
    if (!result.ok) {
      res.status(400).json(rpcError(result.id, result.error.code, result.error.message));
      return;
    }
    const rpc = result.request;
    if (rpc.method === "net_version") {
      res.status(400).json(rpcError(rpc.id, -32601, "Method not allowed for probe"));
      return;
    }
    const now = Date.now();
    if (now - probeWindowStart >= 60_000) { probeWindowStart = now; probeCount = 0; }
    if (++probeCount > PROBE_LIMIT_PER_MINUTE) {
      res.status(429).json(rpcError(rpc.id, -32005, "Probe rate limit exceeded"));
      return;
    }
    if (config.rpcMode === "mock") {
      res.json({ jsonrpc: "2.0", id: rpc.id, result: mockResult(rpc.method) });
      return;
    }
    const outcome = await forwardToUpstream(config.rpcUpstreamUrl!, rpc, opts.fetchImpl);
    if (!outcome.ok) {
      res.status(502).json(rpcError(rpc.id, outcome.error.code, outcome.error.message));
      return;
    }
    res.json({ jsonrpc: "2.0", id: rpc.id, result: outcome.result });
  });

  // Body parsing and JSON-RPC shape checks run before payment, so malformed or
  // disallowed requests are rejected without a 402 challenge and never reach upstream.
  app.post(
    "/rpc",
    express.json({ limit: RPC_BODY_LIMIT }),
    (req: Request, res: Response, next: NextFunction) => {
      const result = validateJsonRpc(req.body);
      if (!result.ok) {
        res.status(400).json(rpcError(result.id, result.error.code, result.error.message));
        return;
      }
      res.locals.rpc = result.request;
      next();
    },
    paymentMiddleware(routes, resourceServer, undefined, undefined, opts.syncFacilitatorOnStart ?? true),
    async (_req: Request, res: Response) => {
      const rpc = res.locals.rpc as JsonRpcRequest;
      opts.onExecute?.(rpc.method);

      if (config.rpcMode === "mock") {
        res.json({ jsonrpc: "2.0", id: rpc.id, result: mockResult(rpc.method) });
        return;
      }

      const outcome = await forwardToUpstream(config.rpcUpstreamUrl!, rpc, opts.fetchImpl);
      if (!outcome.ok) {
        res.status(502).json(rpcError(rpc.id, outcome.error.code, outcome.error.message));
        return;
      }
      res.json({ jsonrpc: "2.0", id: rpc.id, result: outcome.result });
    },
  );

  app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === "entity.parse.failed") {
      res.status(400).json(rpcError(null, -32700, "Parse error"));
      return;
    }
    if (err.type === "entity.too.large") {
      res.status(413).json(rpcError(null, -32600, "Request body too large"));
      return;
    }
    console.error("unhandled error:", err.name);
    res.status(500).json(rpcError(null, -32603, "Internal error"));
  });

  return app;
}
