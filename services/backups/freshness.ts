export type BackupFreshness = "healthy" | "overdue" | "unknown";

export function evaluateBackupFreshness(lastSuccessfulAt: string | null, expectedIntervalHours: number, now = new Date()): BackupFreshness {
  if (!lastSuccessfulAt || !Number.isFinite(expectedIntervalHours) || expectedIntervalHours <= 0) return "unknown";
  const last = new Date(lastSuccessfulAt);
  if (Number.isNaN(last.getTime())) return "unknown";
  return now.getTime() - last.getTime() > expectedIntervalHours * 1.25 * 60 * 60 * 1000 ? "overdue" : "healthy";
}
