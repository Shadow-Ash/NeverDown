import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";

const PORT = Number(process.env.WEB_PORT ?? 3000);
const GATEWAY_URL = (process.env.GATEWAY_URL?.trim() || "http://localhost:8787").replace(/\/$/, "");
const ROOT = resolve(process.cwd(), "..", "..");
const PUBLIC = join(process.cwd(), "public");

function send(res: ServerResponse, status: number, body: any, contentType = "application/json") {
  res.writeHead(status, { "content-type": contentType });
  if (typeof body === "string" || Buffer.isBuffer(body)) res.end(body);
  else res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({ raw: data }); }
    });
  });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function fetchGateway(path: string) {
  const r = await fetch(`${GATEWAY_URL}${path}`);
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: json };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === "/api/status" && req.method === "GET") {
    try {
      const [ready, status] = await Promise.all([fetchGateway("/ready"), fetchGateway("/status")]);
      send(res, 200, { ready: ready.body, status: status.body, gatewayUrl: GATEWAY_URL });
    } catch (e) {
      send(res, 502, { error: e instanceof Error ? e.message : "gateway unavailable" });
    }
    return;
  }

  if (pathname === "/api/run-agent" && req.method === "POST") {
    const body = await readBody(req);
    const scenario = body.scenario === "deny" ? "deny" : "procure";
    const pnpm = spawn("pnpm", ["agent:demo", "--scenario", scenario], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let out = "";
    pnpm.stdout.on("data", (c) => (out += c));
    pnpm.stderr.on("data", (c) => (out += c));
    pnpm.on("close", (code) => {
      let parsed: unknown = null;
      const start = out.indexOf("{");
      const end = out.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(out.slice(start, end + 1)); } catch { parsed = null; }
      }
      send(res, code === 0 ? 200 : 500, { scenario, exitCode: code, receipt: parsed, output: out });
    });
    return;
  }

  if (pathname === "/api/outage" && req.method === "POST") {
    const token = process.env.GATEWAY_INTERNAL_TOKEN || "";
    if (!process.env.GATEWAY_INTERNAL_API || process.env.GATEWAY_INTERNAL_API !== "true") {
      send(res, 412, { error: "Enable GATEWAY_INTERNAL_API=true and set GATEWAY_INTERNAL_TOKEN to use inject hooks." });
      return;
    }
    const body = await readBody(req);
    try {
      const r = await fetch(`${GATEWAY_URL}/_internal/install-standby`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-gateway-internal-token": token },
        body: JSON.stringify(body || {}),
      });
      send(res, r.status, await r.json().catch(() => ({})));
    } catch (e) {
      send(res, 502, { error: e instanceof Error ? e.message : "outage proxy unavailable" });
    }
    return;
  }

  send(res, 404, { error: "unknown route" });
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const path = join(PUBLIC, file);
  if (existsSync(path)) {
    try {
      const body = readFileSync(path);
      send(res, 200, body, MIME[extname(path)] || "text/plain");
    } catch {
      send(res, 404, "not found", "text/plain");
    }
    return;
  }
  send(res, 404, "not found", "text/plain");
}).listen(PORT, () => {
  console.log(`NeverDown console listening on http://localhost:${PORT}`);
  console.log(`Gateway: ${GATEWAY_URL}`);
});
