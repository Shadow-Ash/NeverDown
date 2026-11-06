import { runPurchase } from "./purchase.js";
import { buildPurchaseDeps, loadCredentials } from "./purchase.js";
import { parseWorkerRequestMessage, parseHelloMessage, PaymentWorkerError, isRecord } from "./protocol.js";

async function recover(store: any) {
  try { store.recoverAfterRestart?.(); } catch {}
}

export function createWorkerServer(deps: any, send: (msg: any) => void) {
  let token: string | undefined = process.env.PAYMENT_WORKER_TOKEN;
  const queue: any[] = [];
  let running = false;
  const matches = (expected: string, supplied: string) => expected === supplied && expected.length > 0;

  async function runOne(reqMsg: any) {
    running = true;
    try {
      const outcome = await runPurchase(process.env, deps, loadedCredentials, {
        purchaseId: reqMsg.request.purchaseId,
        serviceId: reqMsg.request.serviceId,
        endpoint: reqMsg.request.endpoint,
      });
      send({ type: "result", requestId: reqMsg.requestId, outcome });
    } catch (e) {
      send({ type: "error", requestId: reqMsg.requestId, code: "WORKER_ERROR", message: e instanceof Error ? e.message : "worker error" });
    } finally {
      running = false;
      const next = queue.shift();
      if (next) runOne(next);
    }
  }

  function handleMessage(raw: any) {
    // first allow hello without token
    if (isRecord(raw) && raw.type === "hello") {
      try {
        const t = parseHelloMessage(raw);
        if (!token) { token = t; send({ type: "ready" }); return; }
        if (t !== token) throw new PaymentWorkerError("invalid token", "UNAUTHORIZED");
        send({ type: "ready" });
        return;
      } catch (e) {
        send({ type: "error", requestId: "?", code: "BAD_HELLO", message: e instanceof Error ? e.message : "bad hello" });
        return;
      }
    }
    if (!token) {
      send({ type: "error", requestId: isRecord(raw)&&typeof raw.requestId==="string"?raw.requestId:"?", code: "UNAUTHORIZED", message: "no session established" });
      return;
    }
    let parsed: { requestId: string; token: string; request: any };
    try { parsed = parseWorkerRequestMessage(raw); } catch (e) {
      send({ type: "error", requestId: isRecord(raw)&&typeof raw.requestId==="string"?raw.requestId:"?", code: e instanceof Error && "code" in e ? (e as any).code : "INVALID_REQUEST", message: e instanceof Error ? e.message : "invalid request" });
      return;
    }
    if (!matches(token, parsed.token)) {
      send({ type: "error", requestId: parsed.requestId, code: "UNAUTHORIZED", message: "invalid caller token" });
      return;
    }
    if (running) { queue.push(parsed); } else { runOne(parsed); }
  }

  return { handleMessage };
}

let loadedCredentials: any;
export function startWorker() {
  const deps = buildPurchaseDeps(process.env);
  loadedCredentials = loadCredentials(process.env);
  recover(deps.store);
  const server: any = createWorkerServer(deps, (msg) => {
    if (process.send) process.send(msg);
  });
  process.on("message", (m) => server.handleMessage(m));
  process.on("disconnect", () => process.exit(0));
  return deps;
}
