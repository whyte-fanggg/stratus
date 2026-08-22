export type ParsedBill = {
  periodStart: string;
  periodEnd: string;
  accountId: string;
  provider: string;
  currency: "USD";
  preTaxCents: number;
  taxCents: number;
  totalCents: number;
};

export function parseUsdToCents(value: string): number {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Invalid USD amount: ${value}`);
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function parseAwsBillText(text: string): ParsedBill {
  const period = text.match(/([A-Z][a-z]{2})\s+(\d{1,2})\s*-\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  const account = text.match(/\b(\d{12})\b/);
  const provider = text.match(/(Amazon Web Services[^\n]+?)\s+USD\s+[\d,.]+/);
  const preTax = text.match(/Total pre-tax\s+USD\s+([\d,]+\.\d{2})/);
  const total = text.match(/Grand total:\s*USD\s*([\d,]+\.\d{2})/);
  if (!period || !account || !provider || !preTax || !total) throw new Error("Unsupported or malformed AWS bill layout");
  const preTaxCents = parseUsdToCents(preTax[1]);
  const totalCents = parseUsdToCents(total[1]);
  if (totalCents < preTaxCents) throw new Error("Grand total cannot be lower than pre-tax total");
  return {
    periodStart: `${period[1]} ${period[2]}, ${period[5]}`,
    periodEnd: `${period[3]} ${period[4]}, ${period[5]}`,
    accountId: account[1], provider: provider[1].trim(), currency: "USD",
    preTaxCents, taxCents: totalCents - preTaxCents, totalCents,
  };
}

export function monthOverMonth(currentCents: number, priorCents: number): number | null {
  if (priorCents === 0) return null;
  return ((currentCents - priorCents) * 100) / priorCents;
}
