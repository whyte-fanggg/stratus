import { clientOrder, clients, type BillMonth, type ClientName } from "../../app/stratus-data.ts";

export type UploadedBillingRecord = {
  client: ClientName;
  month: string;
  monthKey: string;
  year: number;
  totalCents: number;
  preTaxCents: number;
  topService: string;
  topServiceCents: number;
  topRegion: string;
  topRegionCents: number;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  fileName: string;
  uploadedAt: string;
};

const monthNumber: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

export type BillingByClientView = Record<ClientName, BillMonth[]>;

export function mergeUploadedBilling(records: UploadedBillingRecord[]): BillingByClientView {
  return Object.fromEntries(clientOrder.map((clientName) => {
    const periods = new Map<string, BillMonth>();
    for (const bill of clients[clientName].bills) {
      const number = monthNumber[bill.month];
      if (number) periods.set(`2026-${number}`, { ...bill });
    }
    for (const record of records.filter((item) => item.client === clientName)) {
      periods.set(record.monthKey, {
        month: record.month,
        year: record.year,
        total: record.totalCents / 100,
        preTax: record.preTaxCents / 100,
        topService: record.topService,
        topServiceCost: record.topServiceCents / 100,
        topRegion: record.topRegion,
        topRegionCost: record.topRegionCents / 100,
      });
    }
    return [clientName, [...periods.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-6)
      .map(([, bill]) => bill)];
  })) as BillingByClientView;
}
