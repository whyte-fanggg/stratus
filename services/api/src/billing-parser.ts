export type ParsedBill = {
  month: string;
  monthKey: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  accountId: string;
  provider: string;
  currency: "USD" | "INR";
  preTaxCents: number;
  taxCents: number;
  totalCents: number;
  topService: string;
  topServiceCents: number;
  topRegion: string;
  topRegionCents: number;
};

const monthNumbers: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const fullMonthToShort: Record<string, string> = {
  January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May", June: "Jun",
  July: "Jul", August: "Aug", September: "Sep", October: "Oct", November: "Nov", December: "Dec",
};

export function parseUsdToCents(value: string): number {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Invalid USD amount: ${value}`);
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function isoDate(month: string, day: string, year: string): string {
  const number = monthNumbers[month];
  if (!number) throw new Error(`Unsupported billing month: ${month}`);
  const date = new Date(Date.UTC(Number(year), number - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== number - 1 || date.getUTCDate() !== Number(day)) {
    throw new Error("Invalid billing period date");
  }
  return date.toISOString().slice(0, 10);
}

function optionalAmount(match: RegExpMatchArray | null): number {
  return match?.[1] ? parseUsdToCents(match[1]) : 0;
}

export function parseAwsBillText(text: string): ParsedBill {
  const normalized = text.replaceAll("\r", "");
  if (/GST Invoice Summary/i.test(normalized) && /TOTAL AMOUNT DUE/i.test(normalized)) {
    return parseIndiaGstInvoice(normalized);
  }
  const period = normalized.match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\s*-\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\b/);
  const account = normalized.match(/Billing period[\s\S]{0,180}?\b(\d{12})\b/) ?? normalized.match(/\b(\d{12})\b/);
  // PDF extractors do not agree on whether adjacent text runs retain a space.
  // Anchor on AWS's labels and accept either form ("total USD" or "totalUSD").
  const provider = normalized.match(/(Amazon Web Services[^\n]+?)\s*USD\s*[\d,.]+/);
  const preTax = normalized.match(/Total pre-tax\s*USD\s*([\d,]+\.\d{2})/);
  const total = normalized.match(/Grand total:\s*USD\s*([\d,]+\.\d{2})/);
  if (!period || !account || !provider || !preTax || !total) throw new Error("Unsupported or malformed AWS bill layout");

  const startMonth = monthNumbers[period[1]!];
  if (!startMonth) throw new Error("Unsupported billing month");
  const preTaxCents = parseUsdToCents(preTax[1]!);
  const totalCents = parseUsdToCents(total[1]!);
  if (totalCents < preTaxCents) throw new Error("Grand total cannot be lower than pre-tax total");

  const topServiceName = normalized.match(/Highest service spend\s+Service name\s*([^\n]+)\s+Highest service spend\s*USD/i);
  const topServiceAmount = normalized.match(/Highest service spend\s*USD\s*([\d,]+\.\d{2})/i);
  const topRegionName = normalized.match(/Highest AWS Region spend\s+Region name\s*([^\n]+)\s+Highest AWS Region spend\s*USD/i);
  const topRegionAmount = normalized.match(/Highest AWS Region spend\s*USD\s*([\d,]+\.\d{2})/i);
  const regionLabel = topRegionName?.[1]?.match(/\(([^)]+)\)/)?.[1] ?? topRegionName?.[1]?.trim() ?? "Unclassified";

  return {
    month: period[1]!,
    monthKey: `${period[5]}-${String(startMonth).padStart(2, "0")}`,
    year: Number(period[5]),
    periodStart: isoDate(period[1]!, period[2]!, period[5]!),
    periodEnd: isoDate(period[3]!, period[4]!, period[5]!),
    accountId: account[1]!,
    provider: provider[1]!.trim(),
    currency: "USD",
    preTaxCents,
    taxCents: totalCents - preTaxCents,
    totalCents,
    topService: topServiceName?.[1]?.trim() ?? "Unclassified AWS services",
    topServiceCents: optionalAmount(topServiceAmount),
    topRegion: regionLabel,
    topRegionCents: optionalAmount(topRegionAmount),
  };
}

function parseIndiaGstInvoice(normalized: string): ParsedBill {
  const period = normalized.match(/billing period\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*-\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  const account = normalized.match(/Account number:\s*(\d{12})/i);
  const total = normalized.match(/TOTAL AMOUNT DUE ON[\s\S]{0,100}?Rs\.\s*([\d,]+\.\d{2})/i);
  const summary = normalized.match(/AWS Service Charges\s*Rs\.\s*[\d,]+\.\d{2}\s+Charges\s*Rs\.\s*([\d,]+\.\d{2})\s+Credits\/Discount/i);
  const tax = normalized.match(/TOTAL GST\s*Rs\.\s*([\d,]+\.\d{2})/i);
  const provider = normalized.match(/Amazon Web Services India Private Limited/i);
  if (!period || !account || !total || !summary || !tax || !provider) {
    throw new Error("Unsupported or malformed AWS India GST invoice layout");
  }

  const startMonth = fullMonthToShort[period[1]![0]!.toUpperCase() + period[1]!.slice(1).toLowerCase()];
  const endMonth = fullMonthToShort[period[3]![0]!.toUpperCase() + period[3]!.slice(1).toLowerCase()];
  if (!startMonth || !endMonth) throw new Error("Unsupported billing month");
  const preTaxCents = parseUsdToCents(summary[1]!);
  const taxCents = parseUsdToCents(tax[1]!);
  const totalCents = parseUsdToCents(total[1]!);
  if (Math.abs(preTaxCents + taxCents - totalCents) > 2) {
    throw new Error("GST invoice total does not reconcile with pre-tax charges and tax");
  }

  const excluded = /^(AWS Service Charges|Detailed Usage)/i;
  const serviceRows = [...normalized.matchAll(/^([^\n]+?)\s*Rs\.\s*([\d,]+\.\d{2})\s*$/gim)]
    .map((match) => ({ name: match[1]!.trim(), cents: parseUsdToCents(match[2]!) }))
    .filter((row) => !excluded.test(row.name) && /^(Amazon|AWS|Elastic)/i.test(row.name));
  const topService = serviceRows.sort((left, right) => right.cents - left.cents)[0];
  const startMonthNumber = monthNumbers[startMonth]!;

  return {
    month: startMonth,
    monthKey: `${period[5]}-${String(startMonthNumber).padStart(2, "0")}`,
    year: Number(period[5]),
    periodStart: isoDate(startMonth, period[2]!, period[5]!),
    periodEnd: isoDate(endMonth, period[4]!, period[5]!),
    accountId: account[1]!,
    provider: "Amazon Web Services India Private Limited",
    currency: "INR",
    preTaxCents,
    taxCents,
    totalCents,
    topService: topService?.name ?? "Unclassified AWS services",
    topServiceCents: topService?.cents ?? 0,
    topRegion: "Unclassified",
    topRegionCents: 0,
  };
}

export function monthOverMonth(currentCents: number, priorCents: number): number | null {
  if (priorCents === 0) return null;
  return ((currentCents - priorCents) * 100) / priorCents;
}
