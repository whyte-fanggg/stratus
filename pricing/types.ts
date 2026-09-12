export type RegionCode = "ap-south-1" | "ap-south-2";
export type OperatingSystem = "windows" | "windowsSqlStandard";
export type PurchaseOption = "onDemand" | "1yr-partial" | "1yr-all";

export type Ec2CatalogItem = {
  name: string;
  family: "Burstable" | "General purpose" | "Compute optimized" | "Memory optimized";
  vcpu: number;
  memoryGb: number;
};

export type SavingsPlanRates = {
  "1yr-partial"?: number;
  "1yr-all"?: number;
};

export type SoftwareRates = {
  onDemandHourly: number;
  savingsPlans?: SavingsPlanRates;
};

export type Ec2QuoteInput = {
  instance: string;
  region: RegionCode;
  os: OperatingSystem;
  purchase: PurchaseOption;
  quantity: number;
  hours: number;
};

export type Ec2Quote = {
  effectiveHourly: number;
  computeMonthly: number;
  onDemandMonthly: number;
  upfront: number;
  recurringMonthly: number;
  totalCommitment: number;
  savings: number;
  savingsPercent: number;
  termMonths: number;
};
