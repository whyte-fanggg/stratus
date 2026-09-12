import { MANAGED_CLIENTS, SUPPORTED_REGIONS } from "./api/src/client-registry.ts";

export const STRATUS_CLIENTS = MANAGED_CLIENTS;
export const STRATUS_REGIONS = SUPPORTED_REGIONS;

export const SYNC_INTERVALS = {
  backupsMs: 24 * 60 * 60 * 1000,
  infrastructureMs: 7 * 24 * 60 * 60 * 1000,
  operationalRetentionDays: 30,
  billingRetentionMonths: 6,
} as const;

export const DISCOVERY_SERVICES = ["ec2", "ebs", "networking", "iam", "s3", "cloudwatch"] as const;
