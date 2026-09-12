import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ManagedClientName } from "./client-registry.js";
import type { ParsedBill } from "./billing-parser.js";

export type StoredBill = ParsedBill & {
  client: ManagedClientName;
  fileName: string;
  sourceSha256: string;
  uploadedAt: string;
};

const dataDirectory = process.env.BILLING_DATA_DIR ?? "/data";
const storePath = join(dataDirectory, "billing-records.json");
let writeQueue = Promise.resolve();

function isStoredBill(value: unknown): value is StoredBill {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredBill>;
  return typeof item.client === "string" && typeof item.monthKey === "string" && typeof item.totalCents === "number" && typeof item.sourceSha256 === "string";
}

export async function readBillingRecords(): Promise<StoredBill[]> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Billing store is not an array");
    return parsed.filter(isStoredBill).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function upsertBillingRecord(record: StoredBill): Promise<{ record: StoredBill; replaced: boolean }> {
  let result: { record: StoredBill; replaced: boolean } | undefined;
  writeQueue = writeQueue.then(async () => {
    const records = await readBillingRecords();
    const existingIndex = records.findIndex((item) => item.client === record.client && item.monthKey === record.monthKey);
    const replaced = existingIndex >= 0;
    if (replaced) {
      const existing = records[existingIndex]!;
      records[existingIndex] = {
        ...record,
        fxUsdToInr: record.fxUsdToInr ?? existing.fxUsdToInr ?? null,
      };
      record = records[existingIndex]!;
    }
    else records.push(record);
    records.sort((left, right) => left.monthKey.localeCompare(right.monthKey));
    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, storePath);
    result = { record, replaced };
  });
  await writeQueue;
  return result!;
}
