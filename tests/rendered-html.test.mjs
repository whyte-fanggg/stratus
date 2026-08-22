import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: null,
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the Stratus product surface with security headers", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /<title>Stratus/);
  assert.match(html, /Multi-client AWS operations/);
  for (const client of ["Nilkamal", "GCPL", "Swastiks", "Fusion"]) assert.match(html, new RegExp(client));
  assert.doesNotMatch(html, /Simpolo/i);
  assert.match(html, /Ask AI/);
});
