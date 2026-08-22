import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBackupFreshness } from "../services/backups/freshness.ts";
import { monthOverMonth, parseAwsBillText, parseUsdToCents } from "../services/billing/aws-bill-parser.ts";
import { STRATUS_CLIENTS, STRATUS_REGIONS, SYNC_INTERVALS } from "../services/config.ts";
import { inferResourceRole } from "../services/aws/read-only-adapter.ts";
import { shouldRetainObservedAt } from "../services/retention.ts";

test("central configuration contains exactly the requested clients and regions", () => {
  assert.deepEqual(STRATUS_CLIENTS.map((client) => client.name), ["Nilkamal", "GCPL", "Swastiks", "Fusion"]);
  assert.deepEqual(STRATUS_CLIENTS.map((client) => client.profile), ["nilkamal", "gcpl", "swastiks", "fusion"]);
  assert.deepEqual(STRATUS_REGIONS.map((region) => region.id), ["ap-south-1", "ap-south-2"]);
  assert.equal(SYNC_INTERVALS.backupsMs, 86_400_000);
  assert.equal(SYNC_INTERVALS.infrastructureMs, 604_800_000);
});

test("currency parsing uses integer cents", () => {
  assert.equal(parseUsdToCents("7,397.64"), 739764);
  assert.equal(monthOverMonth(739764, 742688)?.toFixed(2), "-0.39");
  assert.throws(() => parseUsdToCents("12.345"));
});

test("AWS bill parser validates period, totals, account, and tax", () => {
  const parsed = parseAwsBillText(`Billing period\nJul 1 - Jul 31, 2026 331174144767\nAWS bill summary\nAmazon Web Services India Private Limited USD 402.27\nGrand total: USD 402.27\nCharges by service\nTotal pre-tax USD 340.91`);
  assert.equal(parsed.accountId, "331174144767");
  assert.equal(parsed.totalCents, 40227);
  assert.equal(parsed.preTaxCents, 34091);
  assert.equal(parsed.taxCents, 6136);
});

test("resource interpretation uses evidence and a safe fallback", () => {
  assert.equal(inferResourceRole({ Environment: "Production" }, "orders-db"), "Production Database");
  assert.equal(inferResourceRole({}, "mystery-01"), "Unclassified EC2 Instance");
});

test("backup freshness includes grace and unknown states", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  assert.equal(evaluateBackupFreshness("2026-08-22T00:00:00Z", 24, now), "healthy");
  assert.equal(evaluateBackupFreshness("2026-08-20T00:00:00Z", 24, now), "overdue");
  assert.equal(evaluateBackupFreshness(null, 24, now), "unknown");
});

test("operational retention keeps only valid recent observations", () => {
  const now = new Date("2026-08-22T00:00:00Z");
  assert.equal(shouldRetainObservedAt("2026-08-01T00:00:00Z", 30, now), true);
  assert.equal(shouldRetainObservedAt("2026-07-01T00:00:00Z", 30, now), false);
  assert.equal(shouldRetainObservedAt("invalid", 30, now), false);
});
