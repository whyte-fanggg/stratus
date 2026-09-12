export type BackupType = "ami" | "full" | "differential" | "transactional";
export type BackupObject = { bucket: string; key: string; prefix: string; lastModified: string; sizeBytes: number; client: string; backupType?: BackupType };
export type BackupMetric = { latest: BackupObject | null; todayCount: number; todayBytes: number; averageBackupBytes: number; averageDailyBytes: number; monthBytes: number; monthCount: number; warning: string | null };
export type BackupSummary = { client: string; category: "ami" | "database"; type: BackupType; metric: BackupMetric };

const CLIENTS = ["Nilkamal OMS", "Nilkamal MWMS", "GCPL", "Swastiks", "Fusion"] as const;
export const BACKUP_CLIENTS = [...CLIENTS];
export function classifyBackup(key: string): BackupType | null {
  const value = key.toLowerCase();
  if (/(skubiq)/i.test(value)) return null;
  if (/(^|\/)tb(\/|$)/i.test(value)) return "transactional";
  if (/(^|\/)db(\/|$)/i.test(value)) return "differential";
  if (/(^|\/)fb(\/|$)/i.test(value)) return "full";
  if (/(transaction|transactional|transaction-log|transaction_log|tlog|\.trn\b)/i.test(value)) return "transactional";
  if (/(differential|diff[-_ ]?backup|\bdiff\b)/i.test(value)) return "differential";
  if (/(full[-_ ]?backup|\bdaily\b|\bfull\b|\.bak\b)/i.test(value)) return "full";
  if (/(ami|application|image|snapshot)/i.test(value)) return "ami";
  return null;
}
export function clientForKey(key: string, bucket: string): string | null {
  const value = `${bucket}/${key}`.toLowerCase();
  if (value.includes("skubiq")) return null;
  if (/(falconoms|oms)/i.test(value)) return "Nilkamal OMS";
  if (/(multitenant|mwms|wms)/i.test(value)) return "Nilkamal MWMS";
  if (value.includes("gcpl")) return "GCPL";
  if (value.includes("swastik")) return "Swastiks";
  if (value.includes("fusion")) return "Fusion";
  return null;
}
function day(value: string, timeZone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function month(value: string, timeZone: string) { return day(value, timeZone).slice(0, 7); }
export function normalizeBackups(
  objects: BackupObject[],
  now = new Date(),
  timeZone = process.env.AWS_BACKUP_TIME_ZONE ?? "Asia/Kolkata",
  clients: readonly string[] = CLIENTS,
): BackupSummary[] {
  const today = day(now.toISOString(), timeZone), currentMonth = month(now.toISOString(), timeZone);
  return clients.flatMap((client) => (["ami", "full", "differential", "transactional"] as BackupType[]).map((type) => {
    const rows = objects.filter((object) => object.client === client && (object.backupType ?? classifyBackup(object.key)) === type);
    const monthRows = rows.filter((object) => month(object.lastModified, timeZone) === currentMonth);
    const todayRows = rows.filter((object) => day(object.lastModified, timeZone) === today);
    const latest = [...rows].sort((a, b) => b.lastModified.localeCompare(a.lastModified))[0] ?? null;
    const days = new Set(monthRows.map((object) => day(object.lastModified, timeZone))).size;
    const monthBytes = monthRows.reduce((sum, object) => sum + object.sizeBytes, 0);
    return { client, category: type === "ami" ? "ami" : "database", type, metric: { latest, todayCount: todayRows.length, todayBytes: todayRows.reduce((sum, object) => sum + object.sizeBytes, 0), averageBackupBytes: monthRows.length ? monthBytes / monthRows.length : 0, averageDailyBytes: days ? monthBytes / days : 0, monthBytes, monthCount: monthRows.length, warning: latest ? null : "No backup found" } };
  }));
}
