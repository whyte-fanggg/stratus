export function cutoffDate(days: number, now = new Date()): Date {
  if (!Number.isInteger(days) || days < 1) throw new Error("Retention days must be a positive integer");
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function shouldRetainObservedAt(observedAt: string, days: number, now = new Date()): boolean {
  const value = new Date(observedAt);
  return !Number.isNaN(value.getTime()) && value >= cutoffDate(days, now);
}
