import express from "express";
import { BackupClient, ListBackupJobsCommand, ListBackupPlansCommand, ListBackupVaultsCommand } from "@aws-sdk/client-backup";
import { DescribeInstancesCommand, DescribeInstanceTypesCommand, DescribeVolumesCommand, EC2Client, type Instance, type InstanceTypeInfo, type Volume } from "@aws-sdk/client-ec2";
import { GetBucketLocationCommand, ListBucketsCommand, ListObjectsV2Command, S3Client, type _Object as S3Object } from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

type ClientProfile = { client: string; profile: string; expectedAccountId: string };
type ProfileCheck = ClientProfile & { connected: boolean; accountId: string | null; accountMatches: boolean; checkedAt: string; errorCode: string | null };
type DiscoveryError = { service: "EC2" | "S3" | "AWS Backup"; region: string; code: string };
type DiscoveredVolume = { volumeId: string; sizeGiB: number | null; type: string | null; state: string | null; encrypted: boolean };
type DiscoveredInstance = {
  instanceId: string; name: string; state: string; instanceType: string; availabilityZone: string; region: string;
  privateIp: string | null; publicIp: string | null; vpcId: string | null; subnetId: string | null;
  platform: string; launchTime: string | null; vCpu: number | null; memoryMiB: number | null;
  securityGroups: Array<{ id: string; name: string }>; volumes: DiscoveredVolume[];
};
type DiscoveredBucket = {
  name: string; region: string; createdAt: string | null; objectsObserved: number; scanTruncated: boolean;
  latestObjects: Array<{ key: string; lastModified: string | null; sizeBytes: number; storageClass: string | null }>;
};
type ProfileInventory = {
  client: string; profile: string; accountId: string | null; discoveredAt: string;
  instances: DiscoveredInstance[]; buckets: DiscoveredBucket[];
  backupVaults: Array<{ name: string; region: string; recoveryPoints: number; createdAt: string | null; locked: boolean }>;
  backupPlans: Array<{ id: string; name: string; region: string; createdAt: string | null; lastExecutionAt: string | null }>;
  backupJobs: Array<{ id: string; state: string; resourceType: string; resourceArn: string; vaultName: string; region: string; createdAt: string | null; completedAt: string | null; sizeBytes: number; statusMessage: string | null }>;
  errors: DiscoveryError[];
};

const clientProfiles: ClientProfile[] = [
  { client: "Nilkamal", profile: process.env.AWS_PROFILE_NILKAMAL ?? "nilkamal", expectedAccountId: "254552067866" },
  { client: "GCPL", profile: process.env.AWS_PROFILE_GCPL ?? "gcpl", expectedAccountId: "768405430897" },
  { client: "Swastiks", profile: process.env.AWS_PROFILE_SWASTIKS ?? "swastiks", expectedAccountId: "181333805300" },
  { client: "Fusion", profile: process.env.AWS_PROFILE_FUSION ?? "fusion", expectedAccountId: "331174144767" },
];
const regions = ["ap-south-1", "ap-south-2"] as const;
const port = Number(process.env.PORT ?? 4000);
const defaultRegion = process.env.AWS_REGION ?? regions[0];
const profileCacheTtlMs = 30_000;
const inventoryCacheTtlMs = 5 * 60_000;
const maxS3PagesPerBucket = 5;
let profileCache: { expiresAt: number; profiles: ProfileCheck[] } | null = null;
let inventoryCache: { expiresAt: number; profiles: ProfileInventory[] } | null = null;

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "name" in error && typeof error.name === "string") return error.name;
  return "AwsDiscoveryFailed";
}
function iso(value: Date | undefined): string | null { return value ? value.toISOString() : null; }
function credentials(profile: string) { return fromIni({ profile }); }

async function checkProfile(definition: ClientProfile): Promise<ProfileCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const client = new STSClient({ region: defaultRegion, credentials: credentials(definition.profile) });
    const identity = await client.send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account ?? null;
    return { ...definition, connected: Boolean(accountId) && accountId === definition.expectedAccountId, accountId, accountMatches: accountId === definition.expectedAccountId, checkedAt, errorCode: null };
  } catch (error) {
    return { ...definition, connected: false, accountId: null, accountMatches: false, checkedAt, errorCode: safeErrorCode(error) };
  }
}

async function getProfileChecks(force = false): Promise<ProfileCheck[]> {
  if (!force && profileCache && profileCache.expiresAt > Date.now()) return profileCache.profiles;
  const profiles = await Promise.all(clientProfiles.map(checkProfile));
  profileCache = { expiresAt: Date.now() + profileCacheTtlMs, profiles };
  return profiles;
}

function instanceName(instance: Instance): string { return instance.Tags?.find((tag) => tag.Key === "Name")?.Value || instance.InstanceId || "Unnamed instance"; }
function toInstance(instance: Instance, region: string, volumes: Map<string, Volume>, instanceTypes: Map<string, InstanceTypeInfo>): DiscoveredInstance {
  const attached = (instance.BlockDeviceMappings ?? []).map((mapping) => mapping.Ebs?.VolumeId).filter((id): id is string => Boolean(id)).map((volumeId) => {
    const volume = volumes.get(volumeId);
    return { volumeId, sizeGiB: volume?.Size ?? null, type: volume?.VolumeType ?? null, state: volume?.State ?? null, encrypted: Boolean(volume?.Encrypted) };
  });
  const typeInfo = instance.InstanceType ? instanceTypes.get(instance.InstanceType) : undefined;
  return {
    instanceId: instance.InstanceId ?? "unknown", name: instanceName(instance), state: instance.State?.Name ?? "unknown",
    instanceType: instance.InstanceType ?? "unknown", availabilityZone: instance.Placement?.AvailabilityZone ?? region, region,
    privateIp: instance.PrivateIpAddress ?? null, publicIp: instance.PublicIpAddress ?? null, vpcId: instance.VpcId ?? null,
    subnetId: instance.SubnetId ?? null, platform: instance.PlatformDetails ?? instance.Platform ?? "Linux/UNIX",
    launchTime: iso(instance.LaunchTime), vCpu: typeInfo?.VCpuInfo?.DefaultVCpus ?? null, memoryMiB: typeInfo?.MemoryInfo?.SizeInMiB ?? null,
    securityGroups: (instance.SecurityGroups ?? []).map((group) => ({ id: group.GroupId ?? "", name: group.GroupName ?? "" })), volumes: attached,
  };
}

async function discoverEc2(profile: string, region: string): Promise<DiscoveredInstance[]> {
  const client = new EC2Client({ region, credentials: credentials(profile) });
  const instances: Instance[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.send(new DescribeInstancesCommand({ NextToken: nextToken }));
    for (const reservation of page.Reservations ?? []) instances.push(...(reservation.Instances ?? []));
    nextToken = page.NextToken;
  } while (nextToken);
  const volumeIds = instances.flatMap((instance) => (instance.BlockDeviceMappings ?? []).map((mapping) => mapping.Ebs?.VolumeId).filter((id): id is string => Boolean(id)));
  const volumeMap = new Map<string, Volume>();
  for (let index = 0; index < volumeIds.length; index += 500) {
    const page = await client.send(new DescribeVolumesCommand({ VolumeIds: volumeIds.slice(index, index + 500) }));
    for (const volume of page.Volumes ?? []) if (volume.VolumeId) volumeMap.set(volume.VolumeId, volume);
  }
  const typeNames = [...new Set(instances.map((instance) => instance.InstanceType).filter((type): type is NonNullable<Instance["InstanceType"]> => Boolean(type)))];
  const typeMap = new Map<string, InstanceTypeInfo>();
  if (typeNames.length) {
    const page = await client.send(new DescribeInstanceTypesCommand({ InstanceTypes: typeNames }));
    for (const typeInfo of page.InstanceTypes ?? []) if (typeInfo.InstanceType) typeMap.set(typeInfo.InstanceType, typeInfo);
  }
  return instances.map((instance) => toInstance(instance, region, volumeMap, typeMap));
}

function latestObjects(objects: S3Object[]) {
  return objects.filter((object): object is S3Object & { Key: string } => Boolean(object.Key))
    .sort((left, right) => (right.LastModified?.getTime() ?? 0) - (left.LastModified?.getTime() ?? 0)).slice(0, 5)
    .map((object) => ({ key: object.Key, lastModified: iso(object.LastModified), sizeBytes: object.Size ?? 0, storageClass: object.StorageClass ?? null }));
}

async function discoverBucket(profile: string, client: S3Client, name: string, createdAt: Date | undefined): Promise<DiscoveredBucket> {
  const location = await client.send(new GetBucketLocationCommand({ Bucket: name }));
  const bucketRegion = location.LocationConstraint || "us-east-1";
  const regionalClient = bucketRegion === defaultRegion ? client : new S3Client({ region: bucketRegion, credentials: credentials(profile) });
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;
  let pages = 0;
  do {
    const page = await regionalClient.send(new ListObjectsV2Command({ Bucket: name, MaxKeys: 1000, ContinuationToken: continuationToken }));
    objects.push(...(page.Contents ?? []));
    continuationToken = page.NextContinuationToken;
    pages += 1;
  } while (continuationToken && pages < maxS3PagesPerBucket);
  return { name, region: bucketRegion, createdAt: iso(createdAt), objectsObserved: objects.length, scanTruncated: Boolean(continuationToken), latestObjects: latestObjects(objects) };
}

async function discoverS3(profile: string): Promise<DiscoveredBucket[]> {
  const client = new S3Client({ region: defaultRegion, credentials: credentials(profile) });
  const response = await client.send(new ListBucketsCommand({}));
  const results = await Promise.allSettled((response.Buckets ?? []).filter((bucket): bucket is typeof bucket & { Name: string } => Boolean(bucket.Name)).map((bucket) => discoverBucket(profile, client, bucket.Name, bucket.CreationDate)));
  return results.filter((result): result is PromiseFulfilledResult<DiscoveredBucket> => result.status === "fulfilled").map((result) => result.value);
}

async function discoverBackup(profile: string, region: string) {
  const client = new BackupClient({ region, credentials: credentials(profile) });
  const [vaults, plans, jobs] = await Promise.all([
    client.send(new ListBackupVaultsCommand({ MaxResults: 1000 })), client.send(new ListBackupPlansCommand({ MaxResults: 1000 })), client.send(new ListBackupJobsCommand({ MaxResults: 100 })),
  ]);
  return {
    vaults: (vaults.BackupVaultList ?? []).map((vault) => ({ name: vault.BackupVaultName ?? "Unnamed vault", region, recoveryPoints: vault.NumberOfRecoveryPoints ?? 0, createdAt: iso(vault.CreationDate), locked: Boolean(vault.Locked) })),
    plans: (plans.BackupPlansList ?? []).map((plan) => ({ id: plan.BackupPlanId ?? "unknown", name: plan.BackupPlanName ?? "Unnamed plan", region, createdAt: iso(plan.CreationDate), lastExecutionAt: iso(plan.LastExecutionDate) })),
    jobs: (jobs.BackupJobs ?? []).map((job) => ({ id: job.BackupJobId ?? "unknown", state: job.State ?? "UNKNOWN", resourceType: job.ResourceType ?? "Unknown", resourceArn: job.ResourceArn ?? "", vaultName: job.BackupVaultName ?? "", region, createdAt: iso(job.CreationDate), completedAt: iso(job.CompletionDate), sizeBytes: job.BackupSizeInBytes ?? 0, statusMessage: job.StatusMessage ?? null })),
  };
}

async function discoverProfile(definition: ClientProfile, check: ProfileCheck): Promise<ProfileInventory> {
  const errors: DiscoveryError[] = [];
  const instances: DiscoveredInstance[] = [];
  const backupVaults: ProfileInventory["backupVaults"] = [];
  const backupPlans: ProfileInventory["backupPlans"] = [];
  const backupJobs: ProfileInventory["backupJobs"] = [];
  let buckets: DiscoveredBucket[] = [];
  if (check.connected) {
    await Promise.all(regions.map(async (region) => {
      const [ec2, backup] = await Promise.allSettled([discoverEc2(definition.profile, region), discoverBackup(definition.profile, region)]);
      if (ec2.status === "fulfilled") instances.push(...ec2.value); else errors.push({ service: "EC2", region, code: safeErrorCode(ec2.reason) });
      if (backup.status === "fulfilled") { backupVaults.push(...backup.value.vaults); backupPlans.push(...backup.value.plans); backupJobs.push(...backup.value.jobs); }
      else errors.push({ service: "AWS Backup", region, code: safeErrorCode(backup.reason) });
    }));
    try { buckets = await discoverS3(definition.profile); } catch (error) { errors.push({ service: "S3", region: "global", code: safeErrorCode(error) }); }
  }
  return {
    client: definition.client, profile: definition.profile, accountId: check.accountId, discoveredAt: new Date().toISOString(),
    instances: instances.sort((left, right) => left.name.localeCompare(right.name)), buckets: buckets.sort((left, right) => left.name.localeCompare(right.name)),
    backupVaults, backupPlans, backupJobs: backupJobs.sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? "")), errors,
  };
}

async function getInventory(force = false): Promise<ProfileInventory[]> {
  if (!force && inventoryCache && inventoryCache.expiresAt > Date.now()) return inventoryCache.profiles;
  const checks = await getProfileChecks(force);
  const profiles = await Promise.all(clientProfiles.map((definition, index) => discoverProfile(definition, checks[index]!)));
  inventoryCache = { expiresAt: Date.now() + inventoryCacheTtlMs, profiles };
  return profiles;
}

const app = express();
app.disable("x-powered-by");
app.get("/health", (_request, response) => { response.json({ ok: true, service: "stratus-api" }); });
app.get("/v1/aws/profiles", async (request, response) => {
  const profiles = await getProfileChecks(request.query.refresh === "1");
  const connected = profiles.filter((profile) => profile.connected).length;
  response.setHeader("Cache-Control", "no-store");
  response.status(connected === profiles.length ? 200 : 503).json({ connector: "local-aws-profile", readOnly: true, connected, expected: profiles.length, allConnected: connected === profiles.length, profiles });
});
app.get("/v1/aws/inventory", async (request, response) => {
  const profiles = await getInventory(request.query.refresh === "1");
  response.setHeader("Cache-Control", "no-store");
  response.json({ connector: "local-aws-profile", readOnly: true, regions, discoveredAt: new Date().toISOString(), profiles });
});
app.listen(port, "0.0.0.0", () => { console.log(`Stratus read-only AWS connector listening on port ${port}`); });
