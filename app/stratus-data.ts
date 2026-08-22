export const clientOrder = ["Nilkamal", "GCPL", "Swastiks", "Fusion"] as const;
export type ClientName = (typeof clientOrder)[number];

export type BillMonth = {
  month: string;
  total: number;
  preTax: number;
  topService: string;
  topServiceCost: number;
  topRegion: string;
  topRegionCost: number;
};

export type Server = {
  name: string;
  role: string;
  environment: string;
  state: "documented" | "unavailable";
  os: string;
  cpu: string;
  memory: string;
  storage: string;
  region: string;
  zone: string;
  publicIp?: string;
  privateIp?: string;
};

type ClientData = {
  initials: string;
  profile: string;
  accent: string;
  accountId: string;
  primaryRegion: string;
  drRegion: string;
  bills: BillMonth[];
  servers: Server[];
  sourceNote: string;
};

function bills(rows: Array<[string, number, number, number, string, number]>): BillMonth[] {
  return rows.map(([month, total, preTax, topServiceCost, topRegion, topRegionCost]) => ({
    month, total, preTax, topService: "Elastic Compute Cloud", topServiceCost, topRegion, topRegionCost,
  }));
}

export const clients: Record<ClientName, ClientData> = {
  Nilkamal: {
    initials: "N", profile: "nilkamal", accent: "#087c76", accountId: "254552067866", primaryRegion: "Mumbai", drRegion: "Hyderabad",
    bills: bills([["Feb", 6623.4, 5613.02, 4801.56, "Mumbai", 4030.42], ["Mar", 2227.01, 1887.26, 1660.26, "Mumbai", 7189.22], ["Apr", 7515.8, 6369.27, 5336.69, "Mumbai", 5795.72], ["May", 4208.74, 3566.73, 3028.6, "Mumbai", 6026.39], ["Jun", 7426.88, 6293.96, 5304.2, "Mumbai", 5779.04], ["Jul", 7397.64, 6269.2, 5129.91, "Mumbai", 5714.89]]),
    servers: [], sourceNote: "Six billing summaries loaded. No Nilkamal infrastructure document was included.",
  },
  GCPL: {
    initials: "G", profile: "gcpl", accent: "#2563a6", accountId: "768405430897", primaryRegion: "Mumbai", drRegion: "Hyderabad",
    bills: bills([["Feb", 1245, 1055.08, 917.34, "Mumbai", 972.85], ["Mar", 726.39, 615.59, 520.93, "Mumbai", 1095.61], ["Apr", 1423.93, 1206.73, 1139.02, "Mumbai", 1194.81], ["May", 1402.45, 1188.53, 1118.69, "Mumbai", 1387.94], ["Jun", 1584.58, 1342.87, 1272.06, "Mumbai", 1334.68], ["Jul", 1584.54, 1342.84, 1264.42, "Mumbai", 1333.27]]),
    servers: [
      { name: "GCPL DB", role: "Database", environment: "Production", state: "documented", os: "Windows Server 2022", cpu: "8 cores", memory: "32 GB", storage: "700 GB EBS", region: "Mumbai", zone: "ap-south-1b", publicIp: "13.234.153.96", privateIp: "172.31.16.12" },
      { name: "GCPLWindowsAPP", role: "Application", environment: "Production", state: "documented", os: "Windows Server 2022", cpu: "Source unavailable", memory: "Source unavailable", storage: "Source unavailable", region: "Mumbai", zone: "ap-south-1b" },
      { name: "GCPL Stage", role: "DB & App Test", environment: "Stage / UAT", state: "documented", os: "Windows Server 2022", cpu: "4 cores", memory: "16 GB", storage: "256 GB EBS (gp3)", region: "Mumbai", zone: "ap-south-1b", publicIp: "35.154.15.241", privateIp: "172.31.16.59" },
    ], sourceNote: "Infrastructure baseline dated June 2026; live AWS state not yet synchronized.",
  },
  Swastiks: {
    initials: "S", profile: "swastiks", accent: "#d97706", accountId: "181333805300", primaryRegion: "Hyderabad", drRegion: "Mumbai",
    bills: bills([["Feb", 619.23, 524.77, 455.03, "Hyderabad", 485.44], ["Mar", 712.59, 603.89, 520.4, "Hyderabad", 591.98], ["Apr", 542.4, 459.65, 435.77, "Hyderabad", 455.84], ["May", 552.03, 467.82, 441.6, "Hyderabad", 463.21], ["Jun", 523.06, 443.27, 417.28, "Hyderabad", 438.01], ["Jul", 520.09, 440.75, 406.85, "Hyderabad", 434.57]]),
    servers: [{ name: "EC2AMAZ-5FVMFUV", role: "Production DB & Application", environment: "Production / Stage", state: "documented", os: "Windows Server 2019 Datacenter", cpu: "8 cores", memory: "32 GB", storage: "300 GB EBS (gp3)", region: "Hyderabad", zone: "ap-south-2c", publicIp: "18.60.188.159", privateIp: "172.31.20.214" }],
    sourceNote: "Infrastructure baseline dated June 2026; live AWS state not yet synchronized.",
  },
  Fusion: {
    initials: "F", profile: "fusion", accent: "#7c3aed", accountId: "331174144767", primaryRegion: "Mumbai", drRegion: "Hyderabad",
    bills: bills([["Feb", 331.43, 280.87, 243.64, "Mumbai", 254.77], ["Mar", 726.85, 615.98, 570.9, "Mumbai", 610.03], ["Apr", 426.12, 361.12, 310.96, "Mumbai", 330.07], ["May", 332.49, 281.77, 262.33, "Mumbai", 279.02], ["Jun", 319.97, 271.16, 254.96, "Mumbai", 267.8], ["Jul", 402.27, 340.91, 280.02, "Mumbai", 319.83]]),
    servers: [{ name: "Fusion-Stageprod", role: "Production & Stage Server", environment: "Production / Stage", state: "documented", os: "Windows Server 2019 Datacenter", cpu: "4 cores", memory: "32 GB", storage: "200 GB EBS (gp3)", region: "Mumbai", zone: "ap-south-1a", publicIp: "15.206.141.169", privateIp: "172.31.44.20" }],
    sourceNote: "Infrastructure baseline dated June 2026; live AWS state not yet synchronized.",
  },
};

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
