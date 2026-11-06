import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const port = 3100 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  cwd: new URL("../apps/web/", import.meta.url),
  env: { ...process.env, WEB_PORT: String(port), INCIDENT_DB_PATH: `neverdown-smoke-${process.pid}.sqlite` },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Web server exited early: ${output}`);
    try { return await fetch(`http://127.0.0.1:${port}/`); } catch { await delay(150); }
  }
  throw new Error(`Web server did not start: ${output}`);
}
try {
  const home = await waitForServer();
  assert.equal(home.status, 200);
  assert.match(await home.text(), /NeverDown/);
  const consolePage = await fetch(`http://127.0.0.1:${port}/console.html`);
  assert.equal(consolePage.status, 200);
  assert.match(await consolePage.text(), /Supreme Agent/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/light-nd.png`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/..%2f..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/incidents`)).status, 200);
  const invalid = await fetch(`http://127.0.0.1:${port}/api/run-agent`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scenario:"invalid"})});
  assert.equal(invalid.status, 400);
  console.log("Web smoke checks passed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(2000)]);
  const dbPath = fileURLToPath(new URL(`../neverdown-smoke-${process.pid}.sqlite`, import.meta.url));
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true });
}