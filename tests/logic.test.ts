import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBackupFreshness } from "../services/backups/freshness.ts";
import { monthOverMonth, parseAwsBillText, parseAwsStatementAllocations, parseUsdToCents } from "../services/billing/aws-bill-parser.ts";
import { STRATUS_CLIENTS, STRATUS_REGIONS, SYNC_INTERVALS } from "../services/config.ts";
import { inferResourceRole } from "../services/aws/read-only-adapter.ts";
import { shouldRetainObservedAt } from "../services/retention.ts";
import { allowsAdministrator, parseIamPolicyDocument } from "../services/api/src/iam-policy.ts";
import { EC2_CATALOG, PRICING_SNAPSHOT, availablePurchaseOptions, ec2SoftwareRates } from "../pricing/aws-pricing-snapshot.ts";
import { calculateEc2Quote, calculateGp3 } from "../pricing/calculator.ts";
import { buildPortfolioOverview, type BillingByClient, type PortfolioInventory } from "../services/portfolio/overview.ts";
import { mergeUploadedBilling } from "../services/billing/merge.ts";
import { normalizeBackups } from "../services/api/src/s3-backups.ts";

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

test("AWS bill parser validates period, account, totals, service, and region", () => {
  const parsed = parseAwsBillText(`Billing period\nJul 1 - Jul 31, 2026\nAccount ID\n331174144767\nAWS bill summary\nAmazon Web Services India Private LimitedUSD 402.27\nGrand total:USD 402.27\nHighest cost by service provider\nHighest service spend\nService nameElastic Compute Cloud\nHighest service spendUSD 280.02\nHighest AWS Region spend\nRegion nameAsia Pacific (Mumbai)\nHighest AWS Region spendUSD 319.83\nCharges by service\nTotal pre-taxUSD 340.91`);
  assert.equal(parsed.accountId, "331174144767");
  assert.equal(parsed.monthKey, "2026-07");
  assert.equal(parsed.totalCents, 40227);
  assert.equal(parsed.preTaxCents, 34091);
  assert.equal(parsed.taxCents, 6136);
  assert.equal(parsed.topService, "Elastic Compute Cloud");
  assert.equal(parsed.topServiceCents, 28002);
  assert.equal(parsed.topRegion, "Mumbai");
  assert.equal(parsed.topRegionCents, 31983);
});

test("AWS India GST tax invoices parse and reconcile in INR", () => {
  const parsed = parseAwsBillText(`GST Invoice\nAccount number:\n254552067866\nGST Invoice Summary\nTOTAL AMOUNT DUE ON\nSeptember 2, 2026\nRs. 330,951.60\nTOTAL GST Rs. 50,484.14\nThis GST Invoice is for the billing period August 1 - August 31, 2026\nAmazon Web Services India Private Limited\nGST Invoice Summary\nAWS Service Charges Rs. 330,951.60\nCharges Rs. 280,467.46\nCredits/Discount Rs. 0.00\nAmazon Simple Storage Service Rs. 11,791.55\nAmazon Elastic Compute Cloud Rs. 268,070.90`);
  assert.equal(parsed.currency, "INR");
  assert.equal(parsed.monthKey, "2026-08");
  assert.equal(parsed.accountId, "254552067866");
  assert.equal(parsed.totalCents, 33_095_160);
  assert.equal(parsed.preTaxCents, 28_046_746);
  assert.equal(parsed.taxCents, 5_048_414);
  assert.equal(parsed.topService, "Amazon Elastic Compute Cloud");
  assert.equal(parsed.topServiceCents, 26_807_090);
  assert.equal(parsed.topRegion, "Unclassified");
});

test("AWS India account statements use linked allocation and exact statement FX", () => {
  const parsed = parseAwsBillText(`Account number:\n254552067866\nAmazon Web Services Statement\nThis Account Summary is for the billing period August 1 - August 31 , 2026\nTotal for this statement in USD USD 6,718.46\nTotal for this statement (1 USD = 95.380550000 INR )\nActivity By Account\ninventrax (254552067866) USD 3,469.81\nSummary for Linked Account\ninventrax (254552067866) USD 3,469.81\nCharges USD 2,940.51\nTax USD 529.30\nAmazon Simple Storage Service USD 123.63\nAmazon Elastic Compute Cloud USD 2,810.55`);
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.fxUsdToInr, 95.38055);
  assert.equal(parsed.totalCents, 346_981);
  assert.equal(parsed.preTaxCents, 294_051);
  assert.equal(parsed.taxCents, 52_930);
  assert.equal(parsed.topService, "Amazon Elastic Compute Cloud");
  assert.equal(parsed.topServiceCents, 281_055);
});

test("consolidated AWS statements expose every linked-account allocation", () => {
  const parsed = parseAwsStatementAllocations(`Account number: 000000000000
Amazon Web Services Statement
This Account Summary is for the billing period August 1 - August 31 , 2026
Total for this statement (1 USD = 95.380550000 INR )
Summary for Linked Account
inventrax (254552067866)USD 3,469.81
ChargesUSD 2,940.51
TaxUSD 529.30
Amazon Elastic Compute CloudUSD 2,810.55
Summary for Linked Account
GCPL (768405430897)USD 1,698.53
ChargesUSD 1,439.43
TaxUSD 259.10
Amazon Elastic Compute CloudUSD 1,300.00`);
  assert.deepEqual(parsed.map((bill) => bill.accountId), ["254552067866", "768405430897"]);
  assert.deepEqual(parsed.map((bill) => bill.totalCents), [346_981, 169_853]);
  assert.ok(parsed.every((bill) => bill.fxUsdToInr === 95.38055));
});

test("uploaded billing replaces matching periods and retains a six-month window", () => {
  const merged = mergeUploadedBilling([{
    client: "Fusion", month: "Aug", monthKey: "2026-08", year: 2026,
    totalCents: 45000, preTaxCents: 38000, topService: "Elastic Compute Cloud",
    topServiceCents: 30000, topRegion: "Mumbai", topRegionCents: 39000,
    accountId: "331174144767", periodStart: "2026-08-01", periodEnd: "2026-08-31",
    fileName: "August.pdf", uploadedAt: "2026-09-06T00:00:00.000Z",
  }]);
  assert.equal(merged.Fusion.length, 6);
  assert.equal(merged.Fusion.at(-1)?.month, "Aug");
  assert.equal(merged.Fusion.at(-1)?.total, 450);
  assert.equal(merged.Fusion.some((bill) => bill.month === "Feb"), false);
});

test("resource interpretation uses evidence and a safe fallback", () => {
  assert.equal(inferResourceRole({ Environment: "Production" }, "orders-db"), "Production Database");
  assert.equal(inferResourceRole({}, "mystery-01"), "Unclassified EC2 Instance");
});

test("IAM administrator evaluation requires wildcard action and resource evidence", () => {
  const admin = parseIamPolicyDocument(encodeURIComponent(JSON.stringify({ Version: "2012-10-17", Statement: { Effect: "Allow", Action: "*", Resource: "*" } })));
  assert.equal(allowsAdministrator(admin), true);
  assert.equal(allowsAdministrator({ Statement: { Effect: "Allow", Action: "iam:*", Resource: "*" } }), false);
  assert.equal(allowsAdministrator({ Statement: { Effect: "Deny", Action: "*", Resource: "*" } }), false);
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

test("S3 backup summaries stay scoped to the owning AWS profile", () => {
  const summaries = normalizeBackups(
    [{
      bucket: "fusion-stageprod-hyd",
      key: "sync-db_backups-from-mumbai/sync-Production-from-mumbai/FB/fusion.bak",
      prefix: "sync-db_backups-from-mumbai/sync-Production-from-mumbai/FB/",
      lastModified: "2026-09-12T00:00:00Z",
      sizeBytes: 1024,
      client: "Fusion",
      backupType: "full",
    }],
    new Date("2026-09-12T12:00:00Z"),
    "Asia/Kolkata",
    ["Fusion"],
  );
  assert.equal(summaries.length, 4);
  assert.deepEqual([...new Set(summaries.map((summary) => summary.client))], ["Fusion"]);
  assert.equal(summaries.find((summary) => summary.type === "full")?.metric.monthCount, 1);
});

test("static pricing snapshot covers the curated EC2 catalog", () => {
  assert.equal(PRICING_SNAPSHOT.asOf, "2026-09-06");
  assert.equal(EC2_CATALOG.length, 24);
  assert.deepEqual(EC2_CATALOG.find((item) => item.name === "t3a.2xlarge"), {
    name: "t3a.2xlarge", family: "Burstable", vcpu: 8, memoryGb: 32,
  });
  assert.equal(Object.keys(PRICING_SNAPSHOT.regions).length, 2);
  assert.equal(PRICING_SNAPSHOT.regions["ap-south-1"].s3StandardGb, 0.025);
  assert.equal(PRICING_SNAPSHOT.regions["ap-south-1"].ebsGp3Gb, 0.0912);
});

test("pricing calculations use verified regional rows and omit unsupported combinations", () => {
  assert.equal(ec2SoftwareRates("t3a.2xlarge", "ap-south-1", "windows")?.onDemandHourly, 0.3443);
  assert.equal(ec2SoftwareRates("t3a.2xlarge", "ap-south-2", "windows"), null);
  assert.deepEqual(availablePurchaseOptions("c6a.xlarge", "ap-south-1", "windows"), ["onDemand", "1yr-partial", "1yr-all"]);
  const partial = calculateEc2Quote({ instance: "c6a.xlarge", region: "ap-south-1", os: "windows", purchase: "1yr-partial", quantity: 1, hours: 730 })!;
  const allUpfront = calculateEc2Quote({ instance: "r6i.4xlarge", region: "ap-south-2", os: "windowsSqlStandard", purchase: "1yr-all", quantity: 1, hours: 730 })!;
  assert.equal(partial.effectiveHourly, 0.24296);
  assert.ok(partial.upfront > 0 && partial.recurringMonthly > 0);
  assert.equal(allUpfront.recurringMonthly, 0);
  assert.ok(allUpfront.upfront > 0 && allUpfront.savings > 0);
});

test("gp3 included performance has no surcharge and excess is charged", () => {
  assert.deepEqual(calculateGp3(500, 1, 3000, 125, "ap-south-1"), { storage: 45.6, additionalIops: 0, additionalThroughput: 0, total: 45.6 });
  const excess = calculateGp3(500, 1, 4000, 250, "ap-south-1");
  assert.equal(excess.additionalIops, 5.7);
  assert.equal(excess.additionalThroughput, 5.7);
  assert.ok(Math.abs(excess.total - 57) < 1e-9);
});

test("portfolio aggregation reconciles spend, compute states, and deduplicated EBS", () => {
  const billing = Object.fromEntries(STRATUS_CLIENTS.map((client, index) => [client.name, [{ month: "Jun", total: 100 + index, topService: "EC2", topServiceCost: 60 }, { month: "Jul", total: 120 + index, topService: "EC2", topServiceCost: 70 }]])) as BillingByClient;
  const inventories: PortfolioInventory[] = [{ client: "Nilkamal", discoveredAt: "2026-09-06T10:00:00Z", instances: [{ instanceId: "i-1", state: "running", volumes: [{ volumeId: "vol-1", sizeGiB: 100 }, { volumeId: "vol-1", sizeGiB: 100 }] }, { instanceId: "i-2", state: "stopped", volumes: [{ volumeId: "vol-2", sizeGiB: 50 }] }], s3Backups: [], errors: [] }];
  const overview = buildPortfolioOverview(billing, inventories, new Date("2026-09-06T12:00:00Z"));
  assert.equal(overview.spend.currentPeriod, overview.spend.byClient.reduce((sum, item) => sum + item.value, 0));
  assert.deepEqual(overview.compute, { total: 2, running: 1, stopped: 1, other: 0 });
  assert.equal(overview.storage.ebsGiB, 150);
  assert.equal(overview.partial, true);
  assert.deepEqual(overview.clients.map((client) => client.name), ["Nilkamal", "GCPL", "Swastiks", "Fusion"]);
});

test("portfolio totals never mix billing periods when one client has a newer bill", () => {
  const billing = Object.fromEntries(STRATUS_CLIENTS.map((client) => [client.name, [
    { month: "Jun", year: 2026, total: 100, topService: "EC2", topServiceCost: 60 },
    { month: "Jul", year: 2026, total: 120, topService: "EC2", topServiceCost: 70 },
    ...(client.name === "Nilkamal" ? [{ month: "Aug", year: 2026, total: 150, topService: "EC2", topServiceCost: 80 }] : []),
  ]])) as BillingByClient;
  const overview = buildPortfolioOverview(billing, [], new Date("2026-09-06T12:00:00Z"));
  assert.equal(overview.spend.currentPeriodLabel, "Aug 2026");
  assert.equal(overview.spend.currentPeriod, 150);
  assert.equal(overview.spend.currentClientsLoaded, 1);
  assert.equal(overview.spend.comparable, false);
  assert.equal(overview.spend.changePercent, null);
  assert.deepEqual(overview.spend.byClient.map((entry) => entry.value), [150, 0, 0, 0]);
  assert.equal(overview.attention.filter((item) => item.service === "Billing").length, 3);
});
