import type { Ec2CatalogItem, OperatingSystem, PurchaseOption, RegionCode, SoftwareRates } from "./types";

/** Reviewed against the AWS Price List and Savings Plans APIs on the snapshot date. */
export const PRICING_SNAPSHOT_DATE = "06 Sep 2026";

export const EC2_CATALOG = [
  { name: "t3.medium", family: "Burstable", vcpu: 2, memoryGb: 4 },
  { name: "t3.large", family: "Burstable", vcpu: 2, memoryGb: 8 },
  { name: "t3.xlarge", family: "Burstable", vcpu: 4, memoryGb: 16 },
  { name: "t3.2xlarge", family: "Burstable", vcpu: 8, memoryGb: 32 },
  { name: "t3a.medium", family: "Burstable", vcpu: 2, memoryGb: 4 },
  { name: "t3a.large", family: "Burstable", vcpu: 2, memoryGb: 8 },
  { name: "t3a.xlarge", family: "Burstable", vcpu: 4, memoryGb: 16 },
  { name: "t3a.2xlarge", family: "Burstable", vcpu: 8, memoryGb: 32 },
  { name: "m6a.xlarge", family: "General purpose", vcpu: 4, memoryGb: 16 },
  { name: "m6a.2xlarge", family: "General purpose", vcpu: 8, memoryGb: 32 },
  { name: "m6a.4xlarge", family: "General purpose", vcpu: 16, memoryGb: 64 },
  { name: "m6i.xlarge", family: "General purpose", vcpu: 4, memoryGb: 16 },
  { name: "m6i.2xlarge", family: "General purpose", vcpu: 8, memoryGb: 32 },
  { name: "m6i.4xlarge", family: "General purpose", vcpu: 16, memoryGb: 64 },
  { name: "c6a.xlarge", family: "Compute optimized", vcpu: 4, memoryGb: 8 },
  { name: "c6a.2xlarge", family: "Compute optimized", vcpu: 8, memoryGb: 16 },
  { name: "c6i.xlarge", family: "Compute optimized", vcpu: 4, memoryGb: 8 },
  { name: "c6i.2xlarge", family: "Compute optimized", vcpu: 8, memoryGb: 16 },
  { name: "r6a.xlarge", family: "Memory optimized", vcpu: 4, memoryGb: 32 },
  { name: "r6a.2xlarge", family: "Memory optimized", vcpu: 8, memoryGb: 64 },
  { name: "r6a.4xlarge", family: "Memory optimized", vcpu: 16, memoryGb: 128 },
  { name: "r6i.xlarge", family: "Memory optimized", vcpu: 4, memoryGb: 32 },
  { name: "r6i.2xlarge", family: "Memory optimized", vcpu: 8, memoryGb: 64 },
  { name: "r6i.4xlarge", family: "Memory optimized", vcpu: 16, memoryGb: 128 },
] as const satisfies readonly Ec2CatalogItem[];

export type Ec2Size = typeof EC2_CATALOG[number]["name"];

const windowsOnDemand = {
  "t3.medium": 0.0632, "t3.large": 0.1172, "t3.xlarge": 0.2528, "t3.2xlarge": 0.5056,
  "t3a.medium": 0.043, "t3a.large": 0.0769, "t3a.xlarge": 0.1722, "t3a.2xlarge": 0.3443,
  "m6a.xlarge": 0.2951, "m6a.2xlarge": 0.5902, "m6a.4xlarge": 1.1804,
  "m6i.xlarge": 0.386, "m6i.2xlarge": 0.772, "m6i.4xlarge": 1.544,
  "c6a.xlarge": 0.2775, "c6a.2xlarge": 0.555, "c6i.xlarge": 0.354, "c6i.2xlarge": 0.708,
  "r6a.xlarge": 0.327, "r6a.2xlarge": 0.654, "r6a.4xlarge": 1.308,
  "r6i.xlarge": 0.444, "r6i.2xlarge": 0.888, "r6i.4xlarge": 1.776,
} as const satisfies Record<Ec2Size, number>;

const mumbaiSavings = {
  "t3.medium": [0.0453, 0.0447], "t3.large": [0.0813, 0.0803], "t3.xlarge": [0.1811, 0.1789], "t3.2xlarge": [0.3622, 0.3579],
  "t3a.medium": [0.0332, 0.0329], "t3a.large": [0.0572, 0.0566], "t3a.xlarge": [0.1327, 0.1315], "t3a.2xlarge": [0.2654, 0.2631],
  "m6a.xlarge": [0.25388, 0.25248], "m6a.2xlarge": [0.50775, 0.50496], "m6a.4xlarge": [1.01551, 1.00992],
  "m6i.xlarge": [0.31105, 0.30851], "m6i.2xlarge": [0.6221, 0.61702], "m6i.4xlarge": [1.2442, 1.23404],
  "c6a.xlarge": [0.24296, 0.24178], "c6a.2xlarge": [0.48592, 0.48356], "c6i.xlarge": [0.2912, 0.28906], "c6i.2xlarge": [0.5824, 0.57811],
  "r6a.xlarge": [0.2735, 0.27171], "r6a.2xlarge": [0.54701, 0.54343], "r6a.4xlarge": [1.09401, 1.08685],
  "r6i.xlarge": [0.34675, 0.34349], "r6i.2xlarge": [0.6935, 0.68699], "r6i.4xlarge": [1.387, 1.37398],
} as const satisfies Record<Ec2Size, readonly [number, number]>;

const hyderabadSavings = {
  "t3.medium": [0.0453, 0.0447], "t3.large": [0.0813, 0.0803], "t3.xlarge": [0.1811, 0.1789], "t3.2xlarge": [0.3622, 0.3579],
  "m6a.xlarge": [0.25399, 0.25259], "m6a.2xlarge": [0.50799, 0.50519], "m6a.4xlarge": [1.01597, 1.01037],
  "m6i.xlarge": [0.31126, 0.30871], "m6i.2xlarge": [0.62252, 0.61743], "m6i.4xlarge": [1.24504, 1.23486],
  "c6a.xlarge": [0.24291, 0.24173], "c6a.2xlarge": [0.48581, 0.48345], "c6i.xlarge": [0.2911, 0.28896], "c6i.2xlarge": [0.5822, 0.57792],
  "r6a.xlarge": [0.27364, 0.27185], "r6a.2xlarge": [0.54728, 0.54369], "r6a.4xlarge": [1.09456, 1.08739],
  "r6i.xlarge": [0.34698, 0.34372], "r6i.2xlarge": [0.69396, 0.68744], "r6i.4xlarge": [1.38792, 1.37489],
} as const satisfies Partial<Record<Ec2Size, readonly [number, number]>>;

export const PRICING_SNAPSHOT = {
  asOf: "2026-09-06",
  sources: {
    ec2: "AWS Price List API AmazonEC2 publication 2026-09-04",
    savingsPlans: "AWS Savings Plans DescribeSavingsPlansOfferingRates API, EC2Instance, shared tenancy",
    serviceBenchmarks: "Official AWS public service pricing pages reviewed 2026-09-06",
  },
  fx: { usdToInr: 88.15, label: "Stored Stratus planning rate" },
  ec2: { windowsOnDemand, savingsPlans: { "ap-south-1": mumbaiSavings, "ap-south-2": hyderabadSavings }, sqlStandardLicensePerVcpuHour: 0.12, sqlMinimumVcpu: 4, partialUpfrontShare: 0.5 },
  regions: {
    "ap-south-1": { label: "Mumbai", ebsGp3Gb: 0.0912, ebsGp3Iops: 0.0057, ebsGp3ThroughputMibps: 0.0456, ebsSnapshotGb: 0.05, s3StandardGb: 0.025, s3StandardIaGb: 0.0138 },
    "ap-south-2": { label: "Hyderabad", ebsGp3Gb: 0.0912, ebsGp3Iops: 0.0057, ebsGp3ThroughputMibps: 0.0456, ebsSnapshotGb: 0.05, s3StandardGb: 0.025, s3StandardIaGb: 0.0138 },
  },
  benchmarks: {
    albHourly: 0.028, lcuHourly: 0.009, vpnHourly: 0.05, publicIpv4Hourly: 0.005,
    interAzGb: 0.01, crossRegionGb: 0.02, internetOutGb: 0.09, route53Zone: 0.50, route53QueriesMillion: 0.40,
    wafAcl: 5, wafRule: 1, wafRequestsMillion: 0.60, secret: 0.40, secretApiTenThousand: 0.05,
    cloudwatchMetric: 0.30, cloudwatchAlarm: 0.10, cloudwatchLogIngestGb: 0.57, cloudwatchLogStorageGb: 0.03,
    cloudtrailDataEventHundredThousand: 0.10, snsMillion: 0.50, configItem: 0.003,
    managedAdDirectoryHour: 0.40, additionalAdControllerHour: 0.20,
    fsxSsdSingleAzGb: 0.13, fsxSsdMultiAzGb: 0.26, fsxThroughputMb: 0.06, fsxBackupGb: 0.05,
    autoScalingDirect: 0, systemsManagerDirect: 0,
  },
} as const;

export function ec2SoftwareRates(instance: Ec2Size, region: RegionCode, os: OperatingSystem): SoftwareRates | null {
  if (region === "ap-south-2" && instance.startsWith("t3a.")) return null;
  const spec = EC2_CATALOG.find((item) => item.name === instance)!;
  if (os === "windowsSqlStandard" && spec.vcpu < PRICING_SNAPSHOT.ec2.sqlMinimumVcpu) return null;
  const license = os === "windowsSqlStandard" ? spec.vcpu * PRICING_SNAPSHOT.ec2.sqlStandardLicensePerVcpuHour : 0;
  const savings = PRICING_SNAPSHOT.ec2.savingsPlans[region][instance as keyof typeof PRICING_SNAPSHOT.ec2.savingsPlans[typeof region]];
  return {
    onDemandHourly: PRICING_SNAPSHOT.ec2.windowsOnDemand[instance] + license,
    savingsPlans: savings ? { "1yr-partial": savings[0] + license, "1yr-all": savings[1] + license } : undefined,
  };
}

export function availablePurchaseOptions(instance: Ec2Size, region: RegionCode, os: OperatingSystem): PurchaseOption[] {
  const rates = ec2SoftwareRates(instance, region, os);
  if (!rates) return [];
  return ["onDemand", ...Object.keys(rates.savingsPlans ?? {})] as PurchaseOption[];
}

export type { OperatingSystem, PurchaseOption, RegionCode } from "./types";
