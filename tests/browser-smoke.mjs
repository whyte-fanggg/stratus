import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), "stratus-e2e-"));
const artifacts = resolve("artifacts");
mkdirSync(artifacts, { recursive: true });
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1920,1080",
  "http://localhost:3000/",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
async function pageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === "page" && item.url.startsWith("http://localhost:3000"));
      if (target) return target;
    } catch { /* Chrome is still starting. */ }
    await delay(250);
  }
  throw new Error("Chrome DevTools target was not ready");
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", rejectOpen, { once: true }); });
let sequence = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", (event) => {
  const payload = JSON.parse(event.data);
  if (payload.method === "Runtime.exceptionThrown") {
    browserErrors.push(payload.params?.exceptionDetails?.text ?? "Uncaught browser exception");
  }
  if (payload.method === "Log.entryAdded" && payload.params?.entry?.level === "error") {
    browserErrors.push(`${payload.params.entry.text} ${payload.params.entry.url ?? ""}`.trim());
  }
  if (payload.method === "Runtime.consoleAPICalled" && payload.params?.type === "error") {
    browserErrors.push("console.error was called");
  }
  if (!payload.id) return;
  const operation = pending.get(payload.id);
  if (!operation) return;
  pending.delete(payload.id);
  if (payload.error) operation.reject(new Error(payload.error.message)); else operation.resolve(payload.result);
});
function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveSend, rejectSend) => pending.set(id, { resolve: resolveSend, reject: rejectSend }));
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForApplicationShell() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evaluate(`
      document.querySelector("h1")?.textContent === "Cloud Operations Overview" &&
      [...document.querySelectorAll("button")].some((node) => node.textContent.trim() === "Upload bill")
    `);
    if (ready) return;
    await delay(500);
  }
  const body = await evaluate(`document.body.innerText`);
  throw new Error(
    `Application shell did not become ready within 20 seconds. Browser errors: ${browserErrors.join(" | ") || "none"}. Body: ${body.slice(0, 800)}`,
  );
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("DOM.enable");
  await waitForApplicationShell();
  const dashboard = await evaluate(`({
    title: document.querySelector("h1")?.textContent,
    clients: [...document.querySelectorAll(".managed-clients button span")].map((node) => node.textContent),
    selectedClientCount: document.querySelectorAll(".managed-clients button.active").length,
    body: document.body.innerText,
  })`);
  assert.equal(dashboard.title, "Cloud Operations Overview");
  assert.deepEqual(dashboard.clients, ["Nilkamal", "GCPL", "Swastiks", "Fusion"]);
  assert.equal(dashboard.selectedClientCount, 0);
  assert.equal(dashboard.body.includes("Skubiq"), false);

  for (const client of ["Nilkamal", "GCPL", "Swastiks", "Fusion"]) {
    await evaluate(`[...document.querySelectorAll(".managed-clients button")].find((node) => node.textContent.includes(${JSON.stringify(client)}))?.click()`);
    await delay(400);
    assert.equal(await evaluate(`document.querySelector("h1")?.textContent`), `${client} overview`);
  }
  await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === "Dashboard")?.click()`);
  await delay(150);
  assert.equal(await evaluate(`document.querySelector("h1")?.textContent`), "Cloud Operations Overview");

  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "k", code: "KeyK", modifiers: 2 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "k", code: "KeyK", modifiers: 2 });
  assert.equal(await evaluate(`document.activeElement === document.querySelector(".search input")`), true);
  await evaluate(`(() => { const input = document.querySelector(".search input"); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, "Fusion"); input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await delay(150);
  assert.match(await evaluate(`document.querySelector(".search-popover")?.innerText ?? ""`), /Fusion/);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  assert.equal(await evaluate(`document.querySelector(".search input")?.value`), "");

  const billFixture = resolve("tmp/pdfs/Bills/Fusion/July.pdf");
  if (existsSync(billFixture)) {
    // Live discovery may still be running; its progress dialog is dismissible and
    // must not prevent testing the independent bill-ingestion workflow.
    await evaluate(`document.querySelector('button[aria-label="Close dialog"]')?.click()`);
    await delay(250);
    await evaluate(`[...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "Upload bill")?.click()`);
    await delay(250);
    const documentNode = await send("DOM.getDocument");
    const fileInput = await send("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector: 'input[type="file"]',
    });
    assert.ok(fileInput.nodeId, "Bill upload input should exist while the modal is open");
    await send("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [billFixture] });
    let uploadMessage = "";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      uploadMessage = await evaluate(`document.querySelector(".modal-message")?.textContent ?? ""`);
      if (uploadMessage.includes("Fusion") && uploadMessage.includes("imported")) break;
      await delay(500);
    }
    assert.match(uploadMessage, /Fusion · Jul 2026 imported at \$402\.27/);
    await evaluate(`document.querySelector('button[aria-label="Close dialog"]')?.click()`);
    await delay(250);
  }

  await evaluate(`[...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "AWS Pricing")?.click()`);
  await delay(500);
  const drawerText = await evaluate(`document.querySelector('[role="dialog"][aria-label="AWS Pricing"]')?.innerText ?? ""`);
  assert.match(drawerText, /AWS pricing snapshot: 06 Sep 2026/);
  assert.match(drawerText, /Data transfer/);
  assert.match(drawTextSafe(drawerText), /CloudWatch/);
  assert.match(drawTextSafe(drawerText), /CloudTrail/);
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(artifacts, "stratus-pricing-drawer.png"), Buffer.from(screenshot.data, "base64"));

  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await delay(250);
  assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="AWS Pricing"]'))`), false);

  await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === "Backups")?.click()`);
  await delay(250);
  assert.match(await evaluate(`document.body.innerText`), /Backup health across workloads/);

  await evaluate(`[...document.querySelectorAll(".managed-clients button")].find((node) => node.textContent.includes("Fusion"))?.click()`);
  await delay(350);
  assert.equal(await evaluate(`document.querySelector("h1")?.textContent`), "Fusion overview");
  await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === "Backups")?.click()`);
  await delay(250);
  assert.equal(await evaluate(`document.querySelector(".backup-hero h2")?.textContent`), "Fusion");
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(".stratus-shell")).getPropertyValue("--client-accent").trim()`), "#7c3aed");
  let pageShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(artifacts, "stratus-fusion-backups.png"), Buffer.from(pageShot.data, "base64"));

  const pageChecks = [
    ["Infrastructure", "EC2 instances"],
    ["Network", "Network overview"],
    ["IAM & Security", "IAM & security"],
    ["Alerts", "Alerts"],
    ["Reports", "Reports"],
    ["Billing", "Billing analysis"],
  ];
  for (const [navigation, heading] of pageChecks) {
    await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === ${JSON.stringify(navigation)})?.click()`);
    await delay(250);
    assert.equal(await evaluate(`document.querySelector(".content h2")?.textContent`), heading);
  }

  await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === "Infrastructure")?.click()`);
  await delay(250);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll(".inventory-filters select")].map((node) => node.getAttribute("aria-label"))`), [
    "Filter servers by region",
    "Filter servers by environment",
    "Filter servers by state",
  ]);

  await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === "Network")?.click()`);
  await delay(250);
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await delay(250);
  pageShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(artifacts, "stratus-fusion-network-1366.png"), Buffer.from(pageShot.data, "base64"));

  await evaluate(`[...document.querySelectorAll("nav button")].find((node) => node.textContent.trim() === "Dashboard")?.click()`);
  await delay(250);
  pageShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(artifacts, "stratus-fusion-dashboard-1366.png"), Buffer.from(pageShot.data, "base64"));
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), true);

  await send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await delay(250);
  pageShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(artifacts, "stratus-fusion-dashboard-tablet.png"), Buffer.from(pageShot.data, "base64"));
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), true);

  await evaluate(`document.querySelector(".ai-button")?.click()`);
  await delay(150);
  assert.equal(await evaluate(`Boolean(document.querySelector(".assistant-panel"))`), true);
  await evaluate(`document.querySelector(".assistant-panel header button")?.click()`);
  await delay(150);
  assert.equal(await evaluate(`Boolean(document.querySelector(".assistant-panel"))`), false);
  assert.deepEqual(browserErrors, []);
  console.log("Browser smoke passed: dashboard, all major pages, live filters, client theming, pricing drawer, upload, responsive widths, and console errors.");
} finally {
  try {
    await send("Browser.close");
  } catch {
    browser.kill();
  }
  socket.close();
  if (browser.exitCode === null) {
    await Promise.race([
      new Promise((resolveExit) => browser.once("exit", resolveExit)),
      delay(5_000),
    ]);
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if (error.code !== "EPERM") throw error;
  }
}

function drawTextSafe(value) { return String(value); }
