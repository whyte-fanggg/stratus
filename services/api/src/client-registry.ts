export const SUPPORTED_REGIONS = [
  { id: "ap-south-1", name: "Mumbai" },
  { id: "ap-south-2", name: "Hyderabad" },
] as const;

export const BACKUP_FREQUENCY_MINUTES = {
  ami: 36 * 24 * 60,
  full: 24 * 60,
  differential: 4 * 60,
  transactional: 15,
} as const;

export type BackupKind = keyof typeof BACKUP_FREQUENCY_MINUTES;
export type BackupScope = {
  bucket: string;
  prefix: string;
  type: BackupKind;
};

export const MANAGED_CLIENTS = [
  {
    id: "nilkamal", name: "Nilkamal", profile: "nilkamal", profileEnv: "AWS_PROFILE_NILKAMAL", accountId: "254552067866",
    initials: "N", accent: "#0f8f83", primaryRegion: "Mumbai", drRegion: "Hyderabad", regions: ["ap-south-1", "ap-south-2"],
    backupWorkloads: [
      { id: "nilkamal-oms", name: "Nilkamal OMS", scopes: [
        { bucket: "nkmlamitranfer", prefix: "AMI_OMS_DB/", type: "ami" },
        { bucket: "inventrax-nilkamal-db-prod-backup-to-hyd", prefix: "FalconOMS_Nilkamal_PROD/FB/", type: "full" },
        { bucket: "inventrax-nilkamal-db-prod-backup-to-hyd", prefix: "FalconOMS_Nilkamal_PROD/DB/", type: "differential" },
        { bucket: "inventrax-nilkamal-db-prod-backup-to-hyd", prefix: "FalconOMS_Nilkamal_PROD/TB/", type: "transactional" },
      ] },
      { id: "nilkamal-mwms", name: "Nilkamal MWMS", scopes: [
        { bucket: "nkmlamitranfer", prefix: "NILKAMAL_MWMS_AMI/", type: "ami" },
        { bucket: "inventrax-nilkamal-db-prod-backup-to-hyd", prefix: "Nilkamal_MultiTenant_PROD/FB/", type: "full" },
        { bucket: "inventrax-nilkamal-db-prod-backup-to-hyd", prefix: "Nilkamal_MultiTenant_PROD/DB/", type: "differential" },
        { bucket: "inventrax-nilkamal-db-prod-backup-to-hyd", prefix: "Nilkamal_MultiTenant_PROD/TB/", type: "transactional" },
      ] },
    ],
  },
  {
    id: "gcpl", name: "GCPL", profile: "gcpl", profileEnv: "AWS_PROFILE_GCPL", accountId: "768405430897",
    initials: "G", accent: "#3174c7", primaryRegion: "Mumbai", drRegion: "Hyderabad", regions: ["ap-south-1", "ap-south-2"],
    backupWorkloads: [{ id: "gcpl", name: "GCPL", scopes: [
      { bucket: "gcplamitransfer", prefix: "", type: "ami" },
      { bucket: "gcplprodbackupshyd", prefix: "sync_from_mumbai/sync-gcpl_full_backup-from-mumbai/FB/", type: "full" },
      { bucket: "gcplprodbackupshyd", prefix: "sync_from_mumbai/sync-gcpl_full_backup-from-mumbai/DB/", type: "differential" },
      { bucket: "gcplprodbackupshyd", prefix: "sync_from_mumbai/sync-gcpl_full_backup-from-mumbai/TB/", type: "transactional" },
    ] }],
  },
  {
    id: "swastiks", name: "Swastiks", profile: "swastiks", profileEnv: "AWS_PROFILE_SWASTIKS", accountId: "181333805300",
    initials: "S", accent: "#e07b16", primaryRegion: "Hyderabad", drRegion: "Mumbai", regions: ["ap-south-1", "ap-south-2"],
    backupWorkloads: [{ id: "swastiks", name: "Swastiks", scopes: [
      { bucket: "swastiksamitransfer", prefix: "", type: "ami" },
      { bucket: "swastiks-stageprod-mumbai", prefix: "sync-db_backups-from-hyd/FB/MRLWMSC21/", type: "full" },
      { bucket: "swastiks-stageprod-mumbai", prefix: "sync-db_backups-from-hyd/DB/", type: "differential" },
      { bucket: "swastiks-stageprod-mumbai", prefix: "sync-db_backups-from-hyd/TB/", type: "transactional" },
    ] }],
  },
  {
    id: "fusion", name: "Fusion", profile: "fusion", profileEnv: "AWS_PROFILE_FUSION", accountId: "331174144767",
    initials: "F", accent: "#7d4be2", primaryRegion: "Mumbai", drRegion: "Hyderabad", regions: ["ap-south-1", "ap-south-2"],
    backupWorkloads: [{ id: "fusion", name: "Fusion", scopes: [
      { bucket: "fusionamitransfer", prefix: "", type: "ami" },
      { bucket: "fusion-stageprod-hyd", prefix: "sync-db_backups-from-mumbai/sync-Production-from-mumbai/FB/", type: "full" },
      { bucket: "fusion-stageprod-hyd", prefix: "sync-db_backups-from-mumbai/sync-Production-from-mumbai/DB/", type: "differential" },
      { bucket: "fusion-stageprod-hyd", prefix: "sync-db_backups-from-mumbai/sync-Production-from-mumbai/TB/", type: "transactional" },
    ] }],
  },
] as const;

export type ManagedClient = (typeof MANAGED_CLIENTS)[number];
export type ManagedClientId = ManagedClient["id"];
export type ManagedClientName = ManagedClient["name"];

export function managedClientProfile(client: ManagedClient): string {
  return process.env[client.profileEnv] ?? client.profile;
}
