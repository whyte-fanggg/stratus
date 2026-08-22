export const STRATUS_CLIENTS = [
  { name: "Nilkamal", profile: "nilkamal" },
  { name: "GCPL", profile: "gcpl" },
  { name: "Swastiks", profile: "swastiks" },
  { name: "Fusion", profile: "fusion" },
] as const;

export const STRATUS_REGIONS = [
  { id: "ap-south-1", name: "Mumbai" },
  { id: "ap-south-2", name: "Hyderabad" },
] as const;

export const SYNC_INTERVALS = {
  backupsMs: 24 * 60 * 60 * 1000,
  infrastructureMs: 7 * 24 * 60 * 60 * 1000,
  operationalRetentionDays: 30,
  billingRetentionMonths: 6,
} as const;

export const DISCOVERY_SERVICES = ["ec2", "ebs", "networking", "iam", "s3", "backup", "cloudwatch"] as const;
