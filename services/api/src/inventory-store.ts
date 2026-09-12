import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type InventorySnapshot<T> = {
  version: 1;
  generalRefreshedAt: string | null;
  backupsRefreshedAt: string | null;
  profiles: T[];
};

const dataDirectory = process.env.AWS_DATA_DIR ?? process.env.BILLING_DATA_DIR ?? "/data";
const storePath = join(dataDirectory, "aws-inventory.json");
let writeQueue = Promise.resolve();

export async function readInventorySnapshot<T>(): Promise<InventorySnapshot<T> | null> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<InventorySnapshot<T>>;
    if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) throw new Error("Inventory store has an unsupported shape.");
    return {
      version: 1,
      generalRefreshedAt: typeof parsed.generalRefreshedAt === "string" ? parsed.generalRefreshedAt : null,
      backupsRefreshedAt: typeof parsed.backupsRefreshedAt === "string" ? parsed.backupsRefreshedAt : null,
      profiles: parsed.profiles,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeInventorySnapshot<T>(snapshot: InventorySnapshot<T>): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, storePath);
  });
  await writeQueue;
}
