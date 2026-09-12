import { BACKUP_FREQUENCY_MINUTES, MANAGED_CLIENTS, type BackupKind, type ManagedClientName } from "../api/src/client-registry.ts";

export type BillingMonth = { month: string; year?: number; total: number; topService: string; topServiceCost: number };
export type BillingByClient = Record<ManagedClientName, BillingMonth[]>;
export type PortfolioInventory = {
  client: ManagedClientName;
  discoveredAt: string;
  instances: Array<{ instanceId: string; state: string; volumes: Array<{ volumeId: string; sizeGiB: number | null }> }>;
  s3Backups: Array<{ client: string; type: BackupKind; metric: { latest: { key: string; lastModified: string; sizeBytes: number; bucket?: string; prefix?: string } | null; todayBytes: number; warning: string | null } }>;
  errors: Array<{ service: string; region: string; code: string }>;
};

export type PortfolioOverview = {
  generatedAt: string;
  partial: boolean;
  clients: Array<{
    id: string; name: ManagedClientName; accent: string; currentSpend: number;
    compute: { total: number; running: number; stopped: number; other: number };
    ebsGiB: number; backupHealthy: number; backupExpected: number; status: "healthy" | "attention" | "unavailable";
  }>;
  spend: {
    currentPeriod: number; previousPeriod: number; changePercent: number | null; currency: "USD";
    currentPeriodKey: string | null; currentPeriodLabel: string; currentClientsLoaded: number; totalClients: number;
    previousPeriodKey: string | null; previousPeriodLabel: string; previousClientsLoaded: number; comparable: boolean;
    byClient: Array<{ client: ManagedClientName; value: number; accent: string }>;
    sixMonthSeries: Array<{ month: string; year: number; total: number; values: Array<{ client: ManagedClientName; value: number; accent: string }> }>;
    byService: Array<{ service: string; value: number }>;
  };
  compute: { total: number; running: number; stopped: number; other: number };
  storage: { ebsGiB: number };
  backups: {
    totalExpected: number; healthy: number; attention: number;
    workloads: Array<{ client: ManagedClientName; workload: string; todayBytes: number; healthy: number; expected: number; types: Array<{ type: BackupKind; healthy: boolean; latestAt: string | null; warning: string | null }> }>;
  };
  attention: Array<{ client: ManagedClientName; service: string; title: string; detail: string }>;
  sources: Array<{ client: ManagedClientName; service: "AWS" | "Billing" | "EC2" | "S3"; status: "healthy" | "partial" | "unavailable"; fetchedAt: string | null; error: string | null }>;
};

function backupIsHealthy(type: BackupKind, latestAt: string | null, now: Date): boolean {
  if (!latestAt) return false;
  const ageMinutes = (now.getTime() - new Date(latestAt).getTime()) / 60_000;
  return Number.isFinite(ageMinutes) && ageMinutes <= BACKUP_FREQUENCY_MINUTES[type] * 1.25;
}
function sumMoney(values: number[]): number {
  return values.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100;
}

export function buildPortfolioOverview(billing: BillingByClient, inventories: PortfolioInventory[], now = new Date()): PortfolioOverview {
  const inventoryByClient = new Map(inventories.map((inventory) => [inventory.client, inventory]));
  const monthIndex: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const periodKey = (bill: BillingMonth) => `${bill.year ?? 2026}-${String(monthIndex[bill.month] ?? 0).padStart(2, "0")}`;
  const periodBills = new Map<string, BillingMonth>();
  for (const bills of Object.values(billing)) for (const bill of bills) periodBills.set(periodKey(bill), bill);
  const allPeriods = [...periodBills.keys()].sort();
  const periods = allPeriods.slice(-6);
  const sixMonthSeries = periods.map((period) => {
    const source = periodBills.get(period)!;
    const values = MANAGED_CLIENTS.map((client) => ({
      client: client.name,
      value: billing[client.name].find((bill) => periodKey(bill) === period)?.total ?? 0,
      accent: client.accent,
    }));
    return { month: source.month, year: source.year ?? 2026, total: sumMoney(values.map((value) => value.value)), values };
  });
  const workloads: PortfolioOverview["backups"]["workloads"] = [];
  const attention: PortfolioOverview["attention"] = [];
  const sources: PortfolioOverview["sources"] = [];

  const currentPeriodKey = allPeriods.at(-1) ?? null;
  const previousPeriodKey = allPeriods.at(-2) ?? null;
  const billForPeriod = (client: ManagedClientName, period: string | null) =>
    period ? billing[client].find((bill) => periodKey(bill) === period) : undefined;
  const currentBills = MANAGED_CLIENTS.map((client) => billForPeriod(client.name, currentPeriodKey));
  const previousBills = MANAGED_CLIENTS.map((client) => billForPeriod(client.name, previousPeriodKey));
  const currentClientsLoaded = currentBills.filter(Boolean).length;
  const previousClientsLoaded = previousBills.filter(Boolean).length;
  const comparable = currentClientsLoaded === MANAGED_CLIENTS.length && previousClientsLoaded === MANAGED_CLIENTS.length;
  const periodLabel = (period: string | null) => {
    if (!period) return "No billing period";
    const source = periodBills.get(period);
    return source ? `${source.month} ${source.year ?? 2026}` : period;
  };

  const clientSummaries = MANAGED_CLIENTS.map((client, clientIndex) => {
    const inventory = inventoryByClient.get(client.name);
    const states = inventory?.instances ?? [];
    const running = states.filter((instance) => instance.state === "running").length;
    const stopped = states.filter((instance) => instance.state === "stopped").length;
    const other = states.length - running - stopped;
    const volumeSizes = new Map<string, number>();
    for (const instance of states) for (const volume of instance.volumes) if (volume.sizeGiB != null) volumeSizes.set(volume.volumeId, volume.sizeGiB);
    let healthyBackups = 0; let expectedBackups = 0;
    for (const workload of client.backupWorkloads) {
      const summaries = inventory?.s3Backups.filter((summary) => summary.client === workload.name) ?? [];
      const types = workload.scopes.map((scope) => {
        const summary = summaries.find((item) => item.type === scope.type);
        const latestAt = summary?.metric.latest?.lastModified ?? null;
        const healthy = backupIsHealthy(scope.type, latestAt, now);
        expectedBackups += 1; if (healthy) healthyBackups += 1;
        if (!healthy) attention.push({ client: client.name, service: "S3", title: `${workload.name} ${scope.type} backup ${latestAt ? "overdue" : "missing"}`, detail: latestAt ? `Last object ${latestAt}` : `${scope.bucket}/${scope.prefix}` });
        return { type: scope.type, healthy, latestAt, warning: summary?.metric.warning ?? (latestAt ? "Overdue" : "No backup found") };
      });
      workloads.push({ client: client.name, workload: workload.name, todayBytes: summaries.reduce((sum, item) => sum + item.metric.todayBytes, 0), healthy: types.filter((type) => type.healthy).length, expected: types.length, types });
    }
    if (!inventory) attention.push({ client: client.name, service: "AWS", title: "AWS inventory unavailable", detail: "No current profile inventory was returned." });
    for (const error of inventory?.errors ?? []) attention.push({ client: client.name, service: error.service, title: `${error.service} discovery failed`, detail: `${error.region} · ${error.code}` });
    const sourceState = !inventory ? "unavailable" : inventory.errors.length ? "partial" : "healthy";
    sources.push({ client: client.name, service: "AWS", status: sourceState, fetchedAt: inventory?.discoveredAt ?? null, error: inventory?.errors[0]?.code ?? null });
    const currentBill = currentBills[clientIndex];
    const billingStatus = !billing[client.name].length ? "unavailable" : currentBill ? "healthy" : "partial";
    const billingError = !billing[client.name].length ? "No billing periods" : currentBill ? null : `No bill for ${periodLabel(currentPeriodKey)}`;
    sources.push({ client: client.name, service: "Billing", status: billingStatus, fetchedAt: now.toISOString(), error: billingError });
    if (!currentBill && currentPeriodKey) attention.push({ client: client.name, service: "Billing", title: `${periodLabel(currentPeriodKey)} bill missing`, detail: "Excluded from the current-period portfolio total." });
    sources.push({ client: client.name, service: "EC2", status: !inventory ? "unavailable" : inventory.errors.some((error) => error.service === "EC2") ? "partial" : "healthy", fetchedAt: inventory?.discoveredAt ?? null, error: inventory?.errors.find((error) => error.service === "EC2")?.code ?? null });
    sources.push({ client: client.name, service: "S3", status: !inventory ? "unavailable" : inventory.errors.some((error) => error.service.startsWith("S3")) ? "partial" : "healthy", fetchedAt: inventory?.discoveredAt ?? null, error: inventory?.errors.find((error) => error.service.startsWith("S3"))?.code ?? null });
    return { id: client.id, name: client.name, accent: client.accent, currentSpend: currentBill?.total ?? 0, compute: { total: states.length, running, stopped, other }, ebsGiB: [...volumeSizes.values()].reduce((sum, size) => sum + size, 0), backupHealthy: healthyBackups, backupExpected: expectedBackups, status: !inventory ? "unavailable" as const : inventory.errors.length || healthyBackups < expectedBackups ? "attention" as const : "healthy" as const };
  });

  const compute = clientSummaries.reduce((total, client) => ({ total: total.total + client.compute.total, running: total.running + client.compute.running, stopped: total.stopped + client.compute.stopped, other: total.other + client.compute.other }), { total: 0, running: 0, stopped: 0, other: 0 });
  const currentPeriod = sumMoney(currentBills.map((bill) => bill?.total ?? 0));
  const previousPeriod = sumMoney(previousBills.map((bill) => bill?.total ?? 0));
  const byClient = MANAGED_CLIENTS.map((client, index) => ({ client: client.name, value: currentBills[index]?.total ?? 0, accent: client.accent }));
  const recordedTopServices = new Map<string, number>();
  for (const bill of currentBills) if (bill) recordedTopServices.set(bill.topService, sumMoney([recordedTopServices.get(bill.topService) ?? 0, bill.topServiceCost]));
  const recordedTopServiceTotal = sumMoney([...recordedTopServices.values()]);
  const byService = [
    ...[...recordedTopServices].map(([service, value]) => ({ service, value })),
    { service: "Other services, credits & tax", value: sumMoney([currentPeriod, -recordedTopServiceTotal]) },
  ].filter((item) => Math.abs(item.value) >= 0.005);
  const totalExpected = workloads.reduce((sum, workload) => sum + workload.expected, 0);
  const healthy = workloads.reduce((sum, workload) => sum + workload.healthy, 0);
  return {
    generatedAt: now.toISOString(), partial: inventories.length !== MANAGED_CLIENTS.length || inventories.some((inventory) => inventory.errors.length > 0) || currentClientsLoaded !== MANAGED_CLIENTS.length, clients: clientSummaries,
    spend: {
      currentPeriod, previousPeriod,
      changePercent: comparable && previousPeriod ? (currentPeriod - previousPeriod) / previousPeriod * 100 : null,
      currency: "USD", currentPeriodKey, currentPeriodLabel: periodLabel(currentPeriodKey), currentClientsLoaded,
      totalClients: MANAGED_CLIENTS.length, previousPeriodKey, previousPeriodLabel: periodLabel(previousPeriodKey),
      previousClientsLoaded, comparable, byClient, sixMonthSeries,
      byService,
    },
    compute, storage: { ebsGiB: clientSummaries.reduce((sum, client) => sum + client.ebsGiB, 0) },
    backups: { totalExpected, healthy, attention: totalExpected - healthy, workloads }, attention, sources,
  };
}
