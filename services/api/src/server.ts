import express from "express";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { DescribeAddressesCommand, DescribeInstancesCommand, DescribeInstanceTypesCommand, DescribeInternetGatewaysCommand, DescribeNatGatewaysCommand, DescribeSecurityGroupsCommand, DescribeSubnetsCommand, DescribeVolumesCommand, DescribeVpcsCommand, DescribeVpnConnectionsCommand, EC2Client, type DescribeInternetGatewaysCommandOutput, type DescribeNatGatewaysCommandOutput, type DescribeSecurityGroupsCommandOutput, type DescribeSubnetsCommandOutput, type DescribeVpcsCommandOutput, type Instance, type InstanceTypeInfo, type Volume } from "@aws-sdk/client-ec2";
import { GetGroupPolicyCommand, GetLoginProfileCommand, GetPolicyCommand, GetPolicyVersionCommand, GetUserPolicyCommand, IAMClient, ListAccessKeysCommand, ListAttachedGroupPoliciesCommand, ListAttachedUserPoliciesCommand, ListGroupPoliciesCommand, ListGroupsForUserCommand, ListMFADevicesCommand, ListUserPoliciesCommand, ListUsersCommand } from "@aws-sdk/client-iam";
import { GetBucketLocationCommand, ListBucketsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseAwsBillText } from "./billing-parser.js";
import { readBillingRecords, upsertBillingRecord } from "./billing-store.js";
import { allowsAdministrator, parseIamPolicyDocument } from "./iam-policy.js";
import { readInventorySnapshot, writeInventorySnapshot, type InventorySnapshot } from "./inventory-store.js";
import { normalizeBackups, type BackupObject, type BackupSummary } from "./s3-backups.js";
import { MANAGED_CLIENTS, SUPPORTED_REGIONS, managedClientProfile } from "./client-registry.js";

type ClientProfile = { client: string; profile: string; expectedAccountId: string };
type ProfileCheck = ClientProfile & { connected: boolean; accountId: string | null; accountMatches: boolean; checkedAt: string; errorCode: string | null };
type DiscoveryError = { service: "PROFILE" | "EC2" | "NETWORK" | "S3" | "S3_BACKUPS" | "IAM"; region: string; code: string };
type DiscoveredVolume = { volumeId: string; sizeGiB: number | null; type: string | null; state: string | null; encrypted: boolean };
type DiscoveredInstance = {
  instanceId: string; name: string; state: string; instanceType: string; availabilityZone: string; region: string;
  privateIp: string | null; publicIp: string | null; vpcId: string | null; subnetId: string | null;
  platform: string; launchTime: string | null; vCpu: number | null; memoryMiB: number | null;
  securityGroups: Array<{ id: string; name: string }>; volumes: DiscoveredVolume[];
};
type DiscoveredBucket = {
  name: string; region: string; createdAt: string | null; objectsObserved: null; scanTruncated: false; metadataOnly: true;
  latestObjects: Array<{ key: string; lastModified: string | null; sizeBytes: number; storageClass: string | null }>;
};
type DiscoveredIamUser = {
  userName: string; arn: string; createdAt: string | null; passwordLastUsedAt: string | null;
  attachedPolicies: string[]; inlinePolicies: string[]; groups: string[]; groupPolicies: string[];
  mfaDeviceCount: number; accessKeys: Array<{ accessKeyId: string; status: string; createdAt: string | null }>;
  consoleAccess: boolean | null;
  administratorAccess: boolean; administratorEvidence: string[]; policyEvaluationComplete: boolean;
};
type DiscoveredNetwork = {
  vpcs: Array<{ vpcId: string; cidr: string | null; state: string; isDefault: boolean; region: string }>;
  subnets: Array<{ subnetId: string; vpcId: string | null; cidr: string | null; availabilityZone: string | null; state: string; availableIpCount: number | null; publicIpOnLaunch: boolean; region: string }>;
  vpns: Array<{ vpnConnectionId: string; state: string; type: string; customerGatewayId: string | null; vpnGatewayId: string | null; transitGatewayId: string | null; region: string; tunnels: Array<{ outsideIp: string | null; status: string; statusMessage: string | null; lastChangedAt: string | null }> }>;
  addresses: Array<{ allocationId: string | null; associationId: string | null; publicIp: string | null; privateIp: string | null; instanceId: string | null; networkInterfaceId: string | null; region: string }>;
  gateways: Array<{ gatewayId: string; type: "internet" | "nat"; state: string; vpcId: string | null; subnetId: string | null; publicIps: string[]; region: string }>;
  securityGroups: Array<{ groupId: string; name: string; description: string; vpcId: string | null; ingressRules: number; egressRules: number; region: string }>;
};
function emptyNetwork(): DiscoveredNetwork { return { vpcs: [], subnets: [], vpns: [], addresses: [], gateways: [], securityGroups: [] }; }
type ProfileInventory = {
  client: string; profile: string; accountId: string | null; discoveredAt: string;
  instances: DiscoveredInstance[]; buckets: DiscoveredBucket[]; iamUsers: DiscoveredIamUser[];
  s3Backups: BackupSummary[];
  network: DiscoveredNetwork;
  errors: DiscoveryError[];
};

const clientProfiles: ClientProfile[] = MANAGED_CLIENTS.map((client) => ({ client: client.name, profile: managedClientProfile(client), expectedAccountId: client.accountId }));
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (data: Buffer) => Promise<{ numpages: number; text: string }>;
const regions = SUPPORTED_REGIONS.map((region) => region.id);
const port = Number(process.env.PORT ?? 4000);
const defaultRegion = process.env.AWS_REGION ?? regions[0];
const profileCacheTtlMs = 30_000;
const generalSyncIntervalMs = 7 * 24 * 60 * 60_000;
const backupSyncIntervalMs = 24 * 60 * 60_000;
const schedulerCheckIntervalMs = 15 * 60_000;
const maxBillBytes = 10 * 1024 * 1024;
const backupScopes = MANAGED_CLIENTS.flatMap((client) => client.backupWorkloads.flatMap((workload) => workload.scopes.map((scope) => ({
  profile: managedClientProfile(client), client: workload.name, bucket: scope.bucket, prefix: scope.prefix, backupType: scope.type,
}))));
let profileCache: { expiresAt: number; profiles: ProfileCheck[] } | null = null;
let inventorySnapshot: InventorySnapshot<ProfileInventory> | null = null;
let inventoryStoreLoaded = false;
let inventoryRequest: Promise<ProfileInventory[]> | null = null;

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

async function discoverNetwork(profile: string, region: string): Promise<DiscoveredNetwork> {
  const client = new EC2Client({ region, credentials: credentials(profile) });
  const vpcs: DiscoveredNetwork["vpcs"] = [];
  const subnets: DiscoveredNetwork["subnets"] = [];
  const vpns: DiscoveredNetwork["vpns"] = [];
  const gateways: DiscoveredNetwork["gateways"] = [];
  const securityGroups: DiscoveredNetwork["securityGroups"] = [];
  let token: string | undefined;
  do {
    const page: DescribeVpcsCommandOutput = await client.send(new DescribeVpcsCommand({ NextToken: token }));
    vpcs.push(...(page.Vpcs ?? []).filter((vpc) => vpc.VpcId).map((vpc) => ({ vpcId: vpc.VpcId!, cidr: vpc.CidrBlock ?? null, state: vpc.State ?? "unknown", isDefault: Boolean(vpc.IsDefault), region })));
    token = page.NextToken;
  } while (token);
  token = undefined;
  do {
    const page: DescribeSubnetsCommandOutput = await client.send(new DescribeSubnetsCommand({ NextToken: token }));
    subnets.push(...(page.Subnets ?? []).filter((subnet) => subnet.SubnetId).map((subnet) => ({ subnetId: subnet.SubnetId!, vpcId: subnet.VpcId ?? null, cidr: subnet.CidrBlock ?? null, availabilityZone: subnet.AvailabilityZone ?? null, state: subnet.State ?? "unknown", availableIpCount: subnet.AvailableIpAddressCount ?? null, publicIpOnLaunch: Boolean(subnet.MapPublicIpOnLaunch), region })));
    token = page.NextToken;
  } while (token);
  const vpnPage = await client.send(new DescribeVpnConnectionsCommand({}));
  vpns.push(...(vpnPage.VpnConnections ?? []).filter((vpn) => vpn.VpnConnectionId).map((vpn) => ({
      vpnConnectionId: vpn.VpnConnectionId!, state: vpn.State ?? "unknown", type: vpn.Type ?? "unknown",
      customerGatewayId: vpn.CustomerGatewayId ?? null, vpnGatewayId: vpn.VpnGatewayId ?? null, transitGatewayId: vpn.TransitGatewayId ?? null, region,
      tunnels: (vpn.VgwTelemetry ?? []).map((tunnel) => ({ outsideIp: tunnel.OutsideIpAddress ?? null, status: tunnel.Status ?? "unknown", statusMessage: tunnel.StatusMessage ?? null, lastChangedAt: iso(tunnel.LastStatusChange) })),
    })));
  const addressPage = await client.send(new DescribeAddressesCommand({}));
  const addresses = (addressPage.Addresses ?? []).map((address) => ({ allocationId: address.AllocationId ?? null, associationId: address.AssociationId ?? null, publicIp: address.PublicIp ?? null, privateIp: address.PrivateIpAddress ?? null, instanceId: address.InstanceId ?? null, networkInterfaceId: address.NetworkInterfaceId ?? null, region }));
  token = undefined;
  do {
    const page: DescribeInternetGatewaysCommandOutput = await client.send(new DescribeInternetGatewaysCommand({ NextToken: token }));
    gateways.push(...(page.InternetGateways ?? []).filter((gateway) => gateway.InternetGatewayId).map((gateway) => ({ gatewayId: gateway.InternetGatewayId!, type: "internet" as const, state: gateway.Attachments?.[0]?.State ?? "detached", vpcId: gateway.Attachments?.[0]?.VpcId ?? null, subnetId: null, publicIps: [], region })));
    token = page.NextToken;
  } while (token);
  token = undefined;
  do {
    const page: DescribeNatGatewaysCommandOutput = await client.send(new DescribeNatGatewaysCommand({ NextToken: token }));
    gateways.push(...(page.NatGateways ?? []).filter((gateway) => gateway.NatGatewayId).map((gateway) => ({ gatewayId: gateway.NatGatewayId!, type: "nat" as const, state: gateway.State ?? "unknown", vpcId: gateway.VpcId ?? null, subnetId: gateway.SubnetId ?? null, publicIps: (gateway.NatGatewayAddresses ?? []).map((address) => address.PublicIp).filter((value): value is string => Boolean(value)), region })));
    token = page.NextToken;
  } while (token);
  token = undefined;
  do {
    const page: DescribeSecurityGroupsCommandOutput = await client.send(new DescribeSecurityGroupsCommand({ NextToken: token }));
    securityGroups.push(...(page.SecurityGroups ?? []).filter((group) => group.GroupId).map((group) => ({ groupId: group.GroupId!, name: group.GroupName ?? group.GroupId!, description: group.Description ?? "", vpcId: group.VpcId ?? null, ingressRules: group.IpPermissions?.length ?? 0, egressRules: group.IpPermissionsEgress?.length ?? 0, region })));
    token = page.NextToken;
  } while (token);
  return { vpcs, subnets, vpns, addresses, gateways, securityGroups };
}

async function discoverBucket(client: S3Client, name: string, createdAt: Date | undefined): Promise<DiscoveredBucket> {
  const location = await client.send(new GetBucketLocationCommand({ Bucket: name }));
  const bucketRegion = location.LocationConstraint || "us-east-1";
  return { name, region: bucketRegion, createdAt: iso(createdAt), objectsObserved: null, scanTruncated: false, metadataOnly: true, latestObjects: [] };
}

async function discoverS3(profile: string): Promise<{ buckets: DiscoveredBucket[]; errors: DiscoveryError[] }> {
  const client = new S3Client({ region: defaultRegion, credentials: credentials(profile) });
  const listed = [] as Array<{ Name?: string; CreationDate?: Date }>;
  let continuationToken: string | undefined;
  do {
    const response = await client.send(new ListBucketsCommand({ ContinuationToken: continuationToken, MaxBuckets: 1000 }));
    listed.push(...(response.Buckets ?? []));
    continuationToken = response.ContinuationToken;
  } while (continuationToken);
  const definitions = listed.filter((bucket): bucket is typeof bucket & { Name: string } => Boolean(bucket.Name) && !/skubiq/i.test(bucket.Name!));
  const results = await Promise.allSettled(definitions.map((bucket) => discoverBucket(client, bucket.Name, bucket.CreationDate)));
  const buckets: DiscoveredBucket[] = [];
  const errors: DiscoveryError[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") buckets.push(result.value);
    else errors.push({ service: "S3", region: `bucket/${definitions[index]!.Name}`, code: safeErrorCode(result.reason) });
  });
  return { buckets, errors };
}

async function discoverBackupScope(profile: string, scope: (typeof backupScopes)[number]): Promise<BackupObject[]> {
  const objects: BackupObject[] = [];
    const base = new S3Client({ region: defaultRegion, credentials: credentials(profile) });
    const location = await base.send(new GetBucketLocationCommand({ Bucket: scope.bucket }));
    const regional = new S3Client({ region: location.LocationConstraint || "us-east-1", credentials: credentials(profile) });
    const prefix = scope.prefix;
  let token: string | undefined;
  do {
    const page = await regional.send(new ListObjectsV2Command({ Bucket: scope.bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken: token }));
    for (const item of page.Contents ?? []) if (item.Key && item.LastModified && !/skubiq/i.test(item.Key)) objects.push({ bucket: scope.bucket, key: item.Key, prefix, lastModified: item.LastModified.toISOString(), sizeBytes: item.Size ?? 0, client: scope.client, backupType: scope.backupType });
    token = page.NextContinuationToken;
  } while (token);
  return objects;
}

async function discoverS3Backups(profile: string): Promise<{ summaries: BackupSummary[]; errors: DiscoveryError[] }> {
  const scopes = backupScopes.filter((item) => item.profile === profile);
  const results = await Promise.allSettled(scopes.map((scope) => discoverBackupScope(profile, scope)));
  const objects: BackupObject[] = [];
  const errors: DiscoveryError[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") objects.push(...result.value);
    else {
      const scope = scopes[index]!;
      errors.push({ service: "S3_BACKUPS", region: `s3://${scope.bucket}/${scope.prefix}`, code: safeErrorCode(result.reason) });
    }
  });
  return {
    summaries: normalizeBackups(
      objects,
      new Date(),
      process.env.AWS_BACKUP_TIME_ZONE ?? "Asia/Kolkata",
      [...new Set(scopes.map((scope) => scope.client))],
    ),
    errors,
  };
}

type GroupPolicyData = {
  name: string;
  attached: Array<{ name: string; arn: string }>;
  inline: Array<{ name: string; document: unknown }>;
};

async function paginateIam<T>(readPage: (marker?: string) => Promise<{ items: T[]; marker?: string; truncated: boolean }>): Promise<T[]> {
  const items: T[] = [];
  let marker: string | undefined;
  do {
    const page = await readPage(marker);
    items.push(...page.items);
    marker = page.truncated ? page.marker : undefined;
  } while (marker);
  return items;
}

async function discoverIam(profile: string): Promise<DiscoveredIamUser[]> {
  const client = new IAMClient({ region: defaultRegion, credentials: credentials(profile) });
  const users = await paginateIam(async (marker) => {
    const page = await client.send(new ListUsersCommand({ Marker: marker, MaxItems: 1000 }));
    return { items: page.Users ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) };
  });
  const groupCache = new Map<string, Promise<GroupPolicyData>>();
  const readGroup = (name: string) => {
    const cached = groupCache.get(name);
    if (cached) return cached;
    const pending = (async () => {
      const [attached, inlineNames] = await Promise.all([
        paginateIam(async (marker) => {
          const page = await client.send(new ListAttachedGroupPoliciesCommand({ GroupName: name, Marker: marker, MaxItems: 1000 }));
          return { items: page.AttachedPolicies ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) };
        }),
        paginateIam(async (marker) => {
          const page = await client.send(new ListGroupPoliciesCommand({ GroupName: name, Marker: marker, MaxItems: 1000 }));
          return { items: page.PolicyNames ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) };
        }),
      ]);
      const inlineDocuments = await Promise.all(inlineNames.map(async (policyName) => {
        const response = await client.send(new GetGroupPolicyCommand({ GroupName: name, PolicyName: policyName }));
        return { name: policyName, document: parseIamPolicyDocument(response.PolicyDocument) };
      }));
      return {
        name,
        attached: attached.filter((policy) => policy.PolicyArn).map((policy) => ({ name: policy.PolicyName ?? policy.PolicyArn!, arn: policy.PolicyArn! })),
        inline: inlineDocuments,
      };
    })();
    groupCache.set(name, pending);
    return pending;
  };

  const rawUsers = await Promise.all(users.filter((user) => user.UserName).map(async (user) => {
    const userName = user.UserName!;
    const [attached, inlineNames, userGroups, mfaDevices, accessKeys, consoleAccess] = await Promise.all([
      paginateIam(async (marker) => { const page = await client.send(new ListAttachedUserPoliciesCommand({ UserName: userName, Marker: marker, MaxItems: 1000 })); return { items: page.AttachedPolicies ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) }; }),
      paginateIam(async (marker) => { const page = await client.send(new ListUserPoliciesCommand({ UserName: userName, Marker: marker, MaxItems: 1000 })); return { items: page.PolicyNames ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) }; }),
      paginateIam(async (marker) => { const page = await client.send(new ListGroupsForUserCommand({ UserName: userName, Marker: marker, MaxItems: 1000 })); return { items: page.Groups ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) }; }),
      paginateIam(async (marker) => { const page = await client.send(new ListMFADevicesCommand({ UserName: userName, Marker: marker, MaxItems: 1000 })); return { items: page.MFADevices ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) }; }),
      paginateIam(async (marker) => { const page = await client.send(new ListAccessKeysCommand({ UserName: userName, Marker: marker, MaxItems: 1000 })); return { items: page.AccessKeyMetadata ?? [], marker: page.Marker, truncated: Boolean(page.IsTruncated) }; }),
      client.send(new GetLoginProfileCommand({ UserName: userName })).then(() => true).catch((error) => safeErrorCode(error) === "NoSuchEntityException" ? false : null),
    ]);
    const [inline, groups] = await Promise.all([
      Promise.all(inlineNames.map(async (policyName) => {
        const response = await client.send(new GetUserPolicyCommand({ UserName: userName, PolicyName: policyName }));
        return { name: policyName, document: parseIamPolicyDocument(response.PolicyDocument) };
      })),
      Promise.all(userGroups.filter((group) => group.GroupName).map((group) => readGroup(group.GroupName!))),
    ]);
    return {
      user,
      attached: attached.filter((policy) => policy.PolicyArn).map((policy) => ({ name: policy.PolicyName ?? policy.PolicyArn!, arn: policy.PolicyArn! })),
      inline,
      groups,
      mfaDeviceCount: mfaDevices.length,
      accessKeys: accessKeys.filter((key) => key.AccessKeyId).map((key) => ({ accessKeyId: key.AccessKeyId!, status: key.Status ?? "Unknown", createdAt: iso(key.CreateDate) })),
      consoleAccess,
    };
  }));

  const managedPolicies = new Map<string, string>();
  for (const item of rawUsers) {
    for (const policy of item.attached) managedPolicies.set(policy.arn, policy.name);
    for (const group of item.groups) for (const policy of group.attached) managedPolicies.set(policy.arn, policy.name);
  }
  const managedDocuments = new Map<string, unknown>();
  const failedManagedPolicies = new Set<string>();
  await Promise.all([...managedPolicies.keys()].map(async (arn) => {
    try {
      const policy = await client.send(new GetPolicyCommand({ PolicyArn: arn }));
      if (!policy.Policy?.DefaultVersionId) throw new Error("Managed policy has no default version.");
      const version = await client.send(new GetPolicyVersionCommand({ PolicyArn: arn, VersionId: policy.Policy.DefaultVersionId }));
      managedDocuments.set(arn, parseIamPolicyDocument(version.PolicyVersion?.Document));
    } catch {
      failedManagedPolicies.add(arn);
    }
  }));

  return rawUsers.map((item) => {
    const evidence: string[] = [];
    for (const policy of item.attached) {
      if (policy.name === "AdministratorAccess" || allowsAdministrator(managedDocuments.get(policy.arn))) evidence.push(`Direct managed policy: ${policy.name}`);
    }
    for (const policy of item.inline) if (allowsAdministrator(policy.document)) evidence.push(`Direct inline policy: ${policy.name}`);
    for (const group of item.groups) {
      for (const policy of group.attached) {
        if (policy.name === "AdministratorAccess" || allowsAdministrator(managedDocuments.get(policy.arn))) evidence.push(`Group ${group.name} managed policy: ${policy.name}`);
      }
      for (const policy of group.inline) if (allowsAdministrator(policy.document)) evidence.push(`Group ${group.name} inline policy: ${policy.name}`);
    }
    return {
      userName: item.user.UserName!, arn: item.user.Arn ?? "", createdAt: iso(item.user.CreateDate), passwordLastUsedAt: iso(item.user.PasswordLastUsed),
      attachedPolicies: item.attached.map((policy) => policy.name), inlinePolicies: item.inline.map((policy) => policy.name),
      groups: item.groups.map((group) => group.name), groupPolicies: item.groups.flatMap((group) => [...group.attached.map((policy) => policy.name), ...group.inline.map((policy) => policy.name)]),
      mfaDeviceCount: item.mfaDeviceCount, accessKeys: item.accessKeys, consoleAccess: item.consoleAccess, administratorAccess: evidence.length > 0,
      administratorEvidence: evidence, policyEvaluationComplete: [...item.attached, ...item.groups.flatMap((group) => group.attached)].every((policy) => !failedManagedPolicies.has(policy.arn)),
    };
  }).sort((left, right) => left.userName.localeCompare(right.userName));
}

async function discoverProfile(definition: ClientProfile, check: ProfileCheck, scope: "all" | "general" | "backups", previous?: ProfileInventory): Promise<ProfileInventory> {
  const runGeneral = scope !== "backups";
  const runBackups = scope !== "general";
  const errors: DiscoveryError[] = (previous?.errors ?? []).filter((error) =>
    runGeneral ? error.service === "S3_BACKUPS" : error.service !== "S3_BACKUPS",
  );
  let instances: DiscoveredInstance[] = previous?.instances ?? [];
  let s3Backups: BackupSummary[] = previous?.s3Backups ?? [];
  let buckets: DiscoveredBucket[] = previous?.buckets ?? [];
  let iamUsers: DiscoveredIamUser[] = previous?.iamUsers ?? [];
  let network: DiscoveredNetwork = previous?.network ?? emptyNetwork();
  if (!check.connected) {
    errors.push({ service: "PROFILE", region: "global", code: check.errorCode ?? "ProfileAccountMismatch" });
  } else if (runGeneral) {
    const refreshedInstances: DiscoveredInstance[] = [];
    const refreshedNetwork = emptyNetwork();
    await Promise.all(regions.map(async (region) => {
      const [ec2, networkResult] = await Promise.allSettled([discoverEc2(definition.profile, region), discoverNetwork(definition.profile, region)]);
      if (ec2.status === "fulfilled") refreshedInstances.push(...ec2.value);
      else {
        refreshedInstances.push(...instances.filter((instance) => instance.region === region));
        errors.push({ service: "EC2", region, code: safeErrorCode(ec2.reason) });
      }
      if (networkResult.status === "fulfilled") {
        for (const key of Object.keys(refreshedNetwork) as Array<keyof DiscoveredNetwork>) refreshedNetwork[key].push(...networkResult.value[key] as never[]);
      } else {
        for (const key of Object.keys(refreshedNetwork) as Array<keyof DiscoveredNetwork>) refreshedNetwork[key].push(...network[key].filter((item) => item.region === region) as never[]);
        errors.push({ service: "NETWORK", region, code: safeErrorCode(networkResult.reason) });
      }
    }));
    instances = refreshedInstances;
    network = refreshedNetwork;
    try {
      const s3 = await discoverS3(definition.profile);
      buckets = s3.buckets;
      errors.push(...s3.errors);
    } catch (error) { errors.push({ service: "S3", region: "global", code: safeErrorCode(error) }); }
    try { iamUsers = await discoverIam(definition.profile); } catch (error) { errors.push({ service: "IAM", region: "global", code: safeErrorCode(error) }); }
  }
  if (check.connected && runBackups) {
    const backup = await discoverS3Backups(definition.profile);
    const failedScopes = backupScopes.filter((item) => item.profile === definition.profile && backup.errors.some((error) => error.region === `s3://${item.bucket}/${item.prefix}`));
    const retained = s3Backups.filter((summary) => failedScopes.some((item) => item.client === summary.client && item.backupType === summary.type));
    s3Backups = [...backup.summaries, ...retained];
    errors.push(...backup.errors);
  }
  return {
    client: definition.client, profile: definition.profile, accountId: check.accountId, discoveredAt: new Date().toISOString(),
    instances: instances.sort((left, right) => left.name.localeCompare(right.name)), buckets: buckets.sort((left, right) => left.name.localeCompare(right.name)), iamUsers,
    s3Backups, network, errors,
  };
}

async function loadInventoryStore(): Promise<void> {
  if (inventoryStoreLoaded) return;
  inventoryStoreLoaded = true;
  try { inventorySnapshot = await readInventorySnapshot<ProfileInventory>(); }
  catch (error) { console.warn("[inventory] persisted snapshot could not be read", { code: safeErrorCode(error) }); }
}

async function refreshInventory(scope: "all" | "general" | "backups", targetClient?: string): Promise<ProfileInventory[]> {
  if (inventoryRequest) return inventoryRequest;
  inventoryRequest = (async () => {
    await loadInventoryStore();
    const startedAt = new Date().toISOString();
    console.info("[inventory] refresh started", { scope, targetClient: targetClient ?? "all", startedAt });
    const checks = await getProfileChecks(true);
    const previous = new Map((inventorySnapshot?.profiles ?? []).map((profile) => [profile.client, profile]));
    const refreshed = await Promise.all(clientProfiles.map(async (definition, index) =>
      !targetClient || definition.client === targetClient
        ? discoverProfile(definition, checks[index]!, scope, previous.get(definition.client))
        : previous.get(definition.client) ?? discoverProfile(definition, checks[index]!, "all"),
    ));
    const profiles = refreshed;
    const completedAt = new Date().toISOString();
    inventorySnapshot = {
      version: 1,
      generalRefreshedAt: !targetClient && (scope === "all" || scope === "general") ? completedAt : inventorySnapshot?.generalRefreshedAt ?? null,
      backupsRefreshedAt: !targetClient && (scope === "all" || scope === "backups") ? completedAt : inventorySnapshot?.backupsRefreshedAt ?? null,
      profiles,
    };
    await writeInventorySnapshot(inventorySnapshot);
    console.info("[inventory] refresh completed", { scope, targetClient: targetClient ?? "all", completedAt, profiles: profiles.length, errors: profiles.reduce((sum, profile) => sum + profile.errors.length, 0) });
    return profiles;
  })();
  try {
    return await inventoryRequest;
  } finally {
    inventoryRequest = null;
  }
}

function due(timestamp: string | null | undefined, intervalMs: number): boolean {
  const value = timestamp ? Date.parse(timestamp) : 0;
  return !Number.isFinite(value) || Date.now() - value >= intervalMs;
}

async function runDueScheduledRefreshes(): Promise<void> {
  await loadInventoryStore();
  if (!inventorySnapshot?.profiles.length) {
    await refreshInventory("all");
    return;
  }
  if (due(inventorySnapshot.generalRefreshedAt, generalSyncIntervalMs)) await refreshInventory("general");
  if (due(inventorySnapshot.backupsRefreshedAt, backupSyncIntervalMs)) await refreshInventory("backups");
}

async function getInventory(force = false, targetClient?: string): Promise<ProfileInventory[]> {
  await loadInventoryStore();
  if (force || !inventorySnapshot?.profiles.length) return refreshInventory("all", targetClient);
  void runDueScheduledRefreshes().catch((error) => console.error("[inventory] scheduled refresh failed", { code: safeErrorCode(error) }));
  return inventorySnapshot.profiles;
}

async function getCachedInventory(): Promise<ProfileInventory[]> {
  await loadInventoryStore();
  void runDueScheduledRefreshes().catch((error) => console.error("[inventory] scheduled refresh failed", { code: safeErrorCode(error) }));
  return inventorySnapshot?.profiles ?? [];
}

function nextSyncAt(timestamp: string | null | undefined, intervalMs: number): string | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? new Date(value + intervalMs).toISOString() : null;
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
  const targetClient = typeof request.query.client === "string" && clientProfiles.some((profile) => profile.client === request.query.client) ? request.query.client : undefined;
  const profiles = request.query.cached === "1" ? await getCachedInventory() : await getInventory(request.query.refresh === "1", targetClient);
  response.setHeader("Cache-Control", "no-store");
  response.json({
    connector: "local-aws-profile", readOnly: true, regions,
    discoveredAt: inventorySnapshot?.generalRefreshedAt ?? inventorySnapshot?.backupsRefreshedAt ?? new Date().toISOString(),
    sync: {
      general: { cadenceHours: 168, lastCompletedAt: inventorySnapshot?.generalRefreshedAt ?? null, nextScheduledAt: nextSyncAt(inventorySnapshot?.generalRefreshedAt, generalSyncIntervalMs) },
      backups: { cadenceHours: 24, lastCompletedAt: inventorySnapshot?.backupsRefreshedAt ?? null, nextScheduledAt: nextSyncAt(inventorySnapshot?.backupsRefreshedAt, backupSyncIntervalMs) },
    },
    profiles,
  });
});
app.get("/v1/billing", async (_request, response) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    response.json({ records: await readBillingRecords() });
  } catch {
    response.status(500).json({ error: "Stored billing records could not be read." });
  }
});
app.post("/v1/billing/upload", express.raw({ type: "application/pdf", limit: maxBillBytes }), async (request, response) => {
  const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return response.status(415).json({ error: "The uploaded file is not a valid PDF." });
  }
  try {
    const extracted = await pdfParse(bytes);
    if (!extracted.text.trim()) return response.status(422).json({ error: "No readable text was found in the PDF." });
    const parsed = parseAwsBillText(extracted.text);
    const client = MANAGED_CLIENTS.find((item) => item.accountId === parsed.accountId);
    if (!client) return response.status(422).json({ error: `AWS account ${parsed.accountId} is not configured as a managed Stratus client.` });
    const encodedName = request.header("x-stratus-file-name") ?? "AWS-bill.pdf";
    let fileName = "AWS-bill.pdf";
    try { fileName = decodeURIComponent(encodedName); } catch { /* Keep the safe fallback. */ }
    fileName = fileName.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180) || "AWS-bill.pdf";
    const stored = await upsertBillingRecord({
      ...parsed,
      client: client.name,
      fileName,
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedAt: new Date().toISOString(),
    });
    response.setHeader("Cache-Control", "no-store");
    return response.status(stored.replaced ? 200 : 201).json({
      bill: stored.record,
      replaced: stored.replaced,
      pagesParsed: extracted.numpages,
      sourceRetained: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bill parsing failed.";
    const safeMessage = /malformed|billing|period|amount|total|month|date/i.test(message)
      ? message
      : "The PDF could not be parsed as an AWS bill summary.";
    return response.status(422).json({ error: safeMessage, sourceRetained: false });
  }
});
app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  if ((error as { type?: string }).type === "entity.too.large") {
    response.status(413).json({ error: "Upload exceeds 10 MB." });
    return;
  }
  next(error);
});
app.listen(port, "0.0.0.0", () => {
  console.log(`Stratus read-only AWS connector listening on port ${port}`);
  setTimeout(() => void runDueScheduledRefreshes().catch((error) => console.error("[inventory] startup refresh failed", { code: safeErrorCode(error) })), 1_000);
  setInterval(() => void runDueScheduledRefreshes().catch((error) => console.error("[inventory] scheduled refresh failed", { code: safeErrorCode(error) })), schedulerCheckIntervalMs).unref();
});
