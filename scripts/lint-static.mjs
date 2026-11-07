import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {Script} from "node:vm";
import {resolve} from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const publicDir=resolve(root,"apps/web/public");
for(const name of ["index.html","console.html"]){
 const html=readFileSync(resolve(publicDir,name),"utf8");
 assert.match(html,/<!doctype html>/i);
 assert.match(html,/<html lang="en">/i);
 const matches=[...html.matchAll(/\bid="([^"]+)"/g)];
 const ids=new Set(matches.map(match=>match[1]));
 assert.equal(ids.size,matches.length,name+": duplicate element id");
 for(const [,target] of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(target),name+": broken anchor #"+target);
 for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/gi))new Script(script,{filename:name+".inline.js"});
}
for(const asset of ["light-nd.png","dark-nd.png","fonts/Redaction50-Regular.woff2","fonts/Redaction50-Bold.woff2","fonts/Redaction50-Italic.woff2"])assert.ok(existsSync(resolve(publicDir,asset)),"missing asset "+asset);
console.log("Static frontend checks passed.");
