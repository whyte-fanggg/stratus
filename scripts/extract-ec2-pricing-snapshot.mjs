import { readFileSync } from "node:fs";

const offerPath = process.argv[2];
const regionCode = process.argv[3];
if (!offerPath || !regionCode) {
  throw new Error("Usage: node scripts/extract-ec2-pricing-snapshot.mjs <offer.json> <region-code>");
}

const wanted = new Set([
  "t3.medium", "t3.large", "t3.xlarge", "t3.2xlarge",
  "t3a.medium", "t3a.large", "t3a.xlarge", "t3a.2xlarge",
  "m6a.xlarge", "m6a.2xlarge", "m6a.4xlarge",
  "m6i.xlarge", "m6i.2xlarge", "m6i.4xlarge",
  "c6a.xlarge", "c6a.2xlarge", "c6i.xlarge", "c6i.2xlarge",
  "r6a.xlarge", "r6a.2xlarge", "r6a.4xlarge",
  "r6i.xlarge", "r6i.2xlarge", "r6i.4xlarge",
]);

const offer = JSON.parse(readFileSync(offerPath, "utf8"));
const rows = [];
for (const [sku, product] of Object.entries(offer.products)) {
  const attributes = product.attributes ?? {};
  if (
    !wanted.has(attributes.instanceType) ||
    attributes.regionCode !== regionCode ||
    attributes.operatingSystem !== "Windows" ||
    attributes.tenancy !== "Shared" ||
    attributes.capacitystatus !== "Used"
  ) continue;
  const software = attributes.preInstalledSw === "NA" && attributes.operation === "RunInstances:0002"
    ? "windows"
    : attributes.preInstalledSw === "SQL Std" && attributes.operation === "RunInstances:0006"
      ? "windowsSqlStandard"
      : null;
  if (!software) continue;
  const term = Object.values(offer.terms.OnDemand?.[sku] ?? {})[0];
  const dimension = Object.values(term?.priceDimensions ?? {})[0];
  const price = Number(dimension?.pricePerUnit?.USD);
  if (Number.isFinite(price)) rows.push({ instance: attributes.instanceType, software, hourly: price });
}

rows.sort((left, right) => left.instance.localeCompare(right.instance) || left.software.localeCompare(right.software));
console.log(JSON.stringify(rows, null, 2));
