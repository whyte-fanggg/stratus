import { DISCOVERY_SERVICES, STRATUS_CLIENTS, STRATUS_REGIONS } from "../config.ts";

export type SyncService = (typeof DISCOVERY_SERVICES)[number];
export type AwsProfile = (typeof STRATUS_CLIENTS)[number]["profile"];
export type AwsRegion = (typeof STRATUS_REGIONS)[number]["id"];

export type DiscoveryResult<T> = { ok: true; data: T; observedAt: string } | { ok: false; code: string; message: string; observedAt: string };

export interface ReadOnlyAwsAdapter {
  discover(profile: AwsProfile, region: AwsRegion | "global", service: SyncService): Promise<DiscoveryResult<unknown[]>>;
}

export const allowedReadOnlyOperations = [
  "Describe*", "Get*", "List*", "LookupEvents",
] as const;

export function assertConfiguredProfile(profile: string): asserts profile is AwsProfile {
  if (!STRATUS_CLIENTS.some((client) => client.profile === profile)) throw new Error(`Unsupported AWS profile: ${profile}`);
}

export function inferResourceRole(tags: Record<string, string>, name: string): string {
  const evidence = `${name} ${Object.entries(tags).map(([key, value]) => `${key} ${value}`).join(" ")}`.toLowerCase();
  if (/\b(prod|production)\b/.test(evidence) && /\b(db|database|sql)\b/.test(evidence)) return "Production Database";
  if (/\b(stage|staging|uat)\b/.test(evidence)) return "Stage Server";
  if (/\b(domain.?controller|\bdc\b)/.test(evidence)) return "Domain Controller";
  if (/\b(dr|disaster.?recovery)\b/.test(evidence)) return "DR Server";
  if (/\bmonitor|grafana|prometheus\b/.test(evidence)) return "Monitoring Server";
  if (/\b(app|web|api|wms)\b/.test(evidence)) return "Application Server";
  if (/\b(db|database|sql)\b/.test(evidence)) return "Database Server";
  return "Unclassified EC2 Instance";
}
