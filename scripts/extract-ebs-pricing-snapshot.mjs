import { readFileSync } from "node:fs";

const offerPath = process.argv[2];
const regionCode = process.argv[3];
if (!offerPath || !regionCode) throw new Error("Usage: node scripts/extract-ebs-pricing-snapshot.mjs <offer.json> <region-code>");

const offer = JSON.parse(readFileSync(offerPath, "utf8"));
const rows = [];
for (const [sku, product] of Object.entries(offer.products)) {
  const attributes = product.attributes ?? {};
  if (attributes.regionCode !== regionCode) continue;
  if (!(attributes.volumeApiName === "gp3" || /gp3|snapshot/i.test(attributes.usagetype ?? ""))) continue;
  for (const term of Object.values(offer.terms.OnDemand?.[sku] ?? {})) {
    for (const dimension of Object.values(term.priceDimensions ?? {})) {
      rows.push({
        family: product.productFamily,
        usageType: attributes.usagetype,
        volumeType: attributes.volumeType,
        unit: dimension.unit,
        description: dimension.description,
        usd: Number(dimension.pricePerUnit?.USD),
      });
    }
  }
}
rows.sort((left, right) => left.usageType.localeCompare(right.usageType));
console.log(JSON.stringify(rows, null, 2));
