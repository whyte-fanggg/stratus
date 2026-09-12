import { PRICING_SNAPSHOT, ec2SoftwareRates, type Ec2Size } from "./aws-pricing-snapshot.ts";
import type { Ec2Quote, Ec2QuoteInput, PurchaseOption, RegionCode } from "./types.ts";

const HOURS_PER_YEAR = 8_760;
const MONTHS_PER_YEAR = 12;

export function calculateEc2Quote(input: Ec2QuoteInput & { instance: Ec2Size }): Ec2Quote | null {
  const rates = ec2SoftwareRates(input.instance, input.region, input.os);
  if (!rates) return null;
  const effectiveHourly = input.purchase === "onDemand" ? rates.onDemandHourly : rates.savingsPlans?.[input.purchase];
  if (effectiveHourly == null) return null;
  const quantity = Math.max(1, input.quantity);
  const hours = Math.max(1, input.hours);
  const onDemandMonthly = rates.onDemandHourly * quantity * hours;
  const computeMonthly = effectiveHourly * quantity * hours;
  if (input.purchase === "onDemand") return { effectiveHourly, computeMonthly, onDemandMonthly, upfront: 0, recurringMonthly: computeMonthly, totalCommitment: 0, savings: 0, savingsPercent: 0, termMonths: 0 };
  const totalCommitment = effectiveHourly * quantity * HOURS_PER_YEAR;
  const upfrontShare = input.purchase === "1yr-all" ? 1 : PRICING_SNAPSHOT.ec2.partialUpfrontShare;
  const upfront = totalCommitment * upfrontShare;
  const recurringMonthly = (totalCommitment - upfront) / MONTHS_PER_YEAR;
  const annualOnDemand = rates.onDemandHourly * quantity * HOURS_PER_YEAR;
  const savings = Math.max(0, annualOnDemand - totalCommitment);
  return { effectiveHourly, computeMonthly, onDemandMonthly, upfront, recurringMonthly, totalCommitment, savings, savingsPercent: annualOnDemand ? savings / annualOnDemand * 100 : 0, termMonths: 12 };
}

export function calculateGp3(sizeGb: number, volumes: number, iops: number, throughput: number, region: RegionCode) {
  const rates = PRICING_SNAPSHOT.regions[region];
  const count = Math.max(0, volumes);
  const storage = Math.max(0, sizeGb) * count * rates.ebsGp3Gb;
  const additionalIops = Math.max(0, iops - 3_000) * count * rates.ebsGp3Iops;
  const additionalThroughput = Math.max(0, throughput - 125) * count * rates.ebsGp3ThroughputMibps;
  return { storage, additionalIops, additionalThroughput, total: storage + additionalIops + additionalThroughput };
}

export function purchaseLabel(option: PurchaseOption): string {
  if (option === "1yr-partial") return "1 Year EC2 Savings Plan · Partial Upfront";
  if (option === "1yr-all") return "1 Year EC2 Savings Plan · All Upfront";
  return "On-Demand";
}
