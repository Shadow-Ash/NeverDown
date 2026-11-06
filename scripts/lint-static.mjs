import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = resolve(root, "apps/web/public");
for (const name of ["index.html", "console.html"]) {
  const html = readFileSync(resolve(publicDir, name), "utf8");
  assert.match(html, /<!doctype html>/i, `${name}: missing doctype`);
  assert.match(html, /<html lang="en">/i, `${name}: missing document language`);
  const matches = [...html.matchAll(/\bid="([^"]+)"/g)];
  const ids = new Set(matches.map(match => match[1]));
  assert.equal(ids.size, matches.length, `${name}: duplicate element id`);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `${name}: missing anchor target #${target}`);
  const refs = [...[...html.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g)].map(match => match[1]), ...[...html.matchAll(/url\(["']?(\/[^"')]+)["']?\)/g)].map(match => match[1])];
  for (const source of refs) {
    const path = source.split(/[?#]/, 1)[0];
    const file = path === "/" ? "index.html" : path.replace(/^\//, "");
    assert.ok(existsSync(resolve(publicDir, file)), `${name}: missing local asset or route ${source}`);
  }
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/gi)) new Script(script, { filename: `${name}.inline.js` });
}
for (const asset of ["light-nd.png", "dark-nd.png", "fonts/Redaction50-Regular.woff2", "fonts/Redaction50-Bold.woff2", "fonts/Redaction50-Italic.woff2"]) assert.ok(existsSync(resolve(publicDir, asset)), `missing asset: ${asset}`);
console.log("Static frontend checks passed: HTML structure, unique IDs, anchors, inline JavaScript and assets.");
