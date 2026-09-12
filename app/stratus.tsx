"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clientOrder,
  clients,
  type BillMonth,
  type ClientName,
  type Server,
  usd,
} from "./stratus-data";
import {
  availablePurchaseOptions,
  EC2_CATALOG,
  ec2SoftwareRates,
  PRICING_SNAPSHOT_DATE,
  PRICING_SNAPSHOT,
  type Ec2Size,
  type OperatingSystem,
  type PurchaseOption,
  type RegionCode,
} from "../pricing/aws-pricing-snapshot";
import {
  calculateEc2Quote,
  calculateGp3,
  purchaseLabel,
} from "../pricing/calculator";
import type { PortfolioOverview } from "../services/portfolio/overview";

type IconName =
  | "dashboard"
  | "billing"
  | "servers"
  | "clients"
  | "cloud"
  | "network"
  | "shield"
  | "alert"
  | "reports"
  | "search"
  | "upload"
  | "refresh"
  | "sparkles"
  | "dollar"
  | "check"
  | "route"
  | "sigma"
  | "info"
  | "map"
  | "clock"
  | "key"
  | "download"
  | "printer"
  | "arrow"
  | "close";

const navGroups: ReadonlyArray<{
  label?: string;
  items: ReadonlyArray<readonly [string, IconName]>;
}> = [
  { items: [["Dashboard", "dashboard"]] },
  {
    label: "Operations",
    items: [
      ["Clients", "clients"],
      ["Billing", "billing"],
      ["Backups", "cloud"],
      ["Infrastructure", "servers"],
      ["Alerts", "alert"],
    ],
  },
  {
    label: "More",
    items: [
      ["Network", "network"],
      ["IAM & Security", "shield"],
      ["Reports", "reports"],
      ["Settings", "info"],
    ],
  },
];

const serviceSteps = [
  "Profile validation",
  "AWS inventory",
  "Portfolio summary",
];
const clientArtwork: Record<ClientName, string> = {
  Nilkamal: "/sidebar-landscape.png",
  GCPL: "/sidebar-gcpl.png",
  Swastiks: "/sidebar-swastiks.png",
  Fusion: "/sidebar-fusion.png",
};

type LiveVolume = {
  volumeId: string;
  sizeGiB: number | null;
  type: string | null;
  state: string | null;
  encrypted: boolean;
};
type LiveInstance = {
  instanceId: string;
  name: string;
  state: string;
  instanceType: string;
  availabilityZone: string;
  region: string;
  privateIp: string | null;
  publicIp: string | null;
  vpcId: string | null;
  subnetId: string | null;
  platform: string;
  launchTime: string | null;
  vCpu: number | null;
  memoryMiB: number | null;
  securityGroups: Array<{ id: string; name: string }>;
  volumes: LiveVolume[];
};
type LiveBucket = {
  name: string;
  region: string;
  createdAt: string | null;
  objectsObserved: number | null;
  scanTruncated: boolean;
  metadataOnly?: boolean;
  latestObjects: Array<{
    key: string;
    lastModified: string | null;
    sizeBytes: number;
    storageClass: string | null;
  }>;
};
type LiveIamUser = {
  userName: string;
  arn: string;
  createdAt: string | null;
  passwordLastUsedAt: string | null;
  attachedPolicies: string[];
  inlinePolicies: string[];
  groups: string[];
  groupPolicies: string[];
  mfaDeviceCount: number;
  accessKeys: Array<{
    accessKeyId: string;
    status: string;
    createdAt: string | null;
  }>;
  consoleAccess: boolean | null;
  administratorAccess: boolean;
  administratorEvidence: string[];
  policyEvaluationComplete: boolean;
};
type LiveNetwork = {
  vpcs: Array<{ vpcId: string; cidr: string | null; state: string; isDefault: boolean; region: string }>;
  subnets: Array<{ subnetId: string; vpcId: string | null; cidr: string | null; availabilityZone: string | null; state: string; availableIpCount: number | null; publicIpOnLaunch: boolean; region: string }>;
  vpns: Array<{ vpnConnectionId: string; state: string; type: string; customerGatewayId: string | null; vpnGatewayId: string | null; transitGatewayId: string | null; region: string; tunnels: Array<{ outsideIp: string | null; status: string; statusMessage: string | null; lastChangedAt: string | null }> }>;
  addresses: Array<{ allocationId: string | null; associationId: string | null; publicIp: string | null; privateIp: string | null; instanceId: string | null; networkInterfaceId: string | null; region: string }>;
  gateways: Array<{ gatewayId: string; type: "internet" | "nat"; state: string; vpcId: string | null; subnetId: string | null; publicIps: string[]; region: string }>;
  securityGroups: Array<{ groupId: string; name: string; description: string; vpcId: string | null; ingressRules: number; egressRules: number; region: string }>;
};
type AwsProfileInventory = {
  client: ClientName;
  profile: string;
  accountId: string | null;
  discoveredAt: string;
  instances: LiveInstance[];
  buckets: LiveBucket[];
  s3Backups: Array<{
    client: string;
    category: "ami" | "database";
    type: "ami" | "full" | "differential" | "transactional";
    metric: {
      latest: { key: string; lastModified: string; sizeBytes: number } | null;
      todayCount: number;
      todayBytes: number;
      averageBackupBytes: number;
      averageDailyBytes: number;
      monthBytes: number;
      monthCount: number;
      warning: string | null;
    };
  }>;
  iamUsers: LiveIamUser[];
  network?: LiveNetwork;
  errors: Array<{ service: string; region: string; code: string }>;
};
type AwsInventoryState = {
  state: "loading" | "ready" | "unavailable";
  profiles: AwsProfileInventory[];
  sync?: {
    general: { cadenceHours: number; lastCompletedAt: string | null; nextScheduledAt: string | null };
    backups: { cadenceHours: number; lastCompletedAt: string | null; nextScheduledAt: string | null };
  };
  reason?: string;
};
type PortfolioState = {
  state: "loading" | "refreshing" | "ready" | "unavailable";
  data: PortfolioOverview | null;
  reason?: string;
};
type BillingByClientView = Record<ClientName, BillMonth[]>;
type DisplayServer = Server & {
  source: "live" | "documented";
  instanceId?: string;
  liveState?: string;
  instanceType?: string;
  launchedAt?: string | null;
  vpcId?: string | null;
  subnetId?: string | null;
  securityGroups?: Array<{ id: string; name: string }>;
  volumes?: LiveVolume[];
};
type GlobalSearchResult = {
  id: string;
  title: string;
  detail: string;
  icon: IconName;
  page?: string;
  client?: ClientName;
  server?: DisplayServer;
  action?: "upload" | "refresh" | "assistant";
};

type AwsProfileStatus = {
  client: ClientName;
  profile: string;
  expectedAccountId: string;
  connected: boolean;
  accountId: string | null;
  accountMatches: boolean;
  checkedAt: string;
  errorCode: string | null;
};

type AwsConnectorStatus = {
  state: "checking" | "connected" | "degraded" | "unavailable";
  connected: number;
  expected: number;
  allConnected: boolean;
  profiles: AwsProfileStatus[];
  reason?: string;
};

async function readAwsConnectorStatus(
  force = false,
): Promise<AwsConnectorStatus> {
  try {
    const response = await fetch(
      `/api/aws/status${force ? "?refresh=1" : ""}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as Partial<AwsConnectorStatus>;
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    if (!profiles.length)
      return {
        state: "unavailable",
        connected: 0,
        expected: 4,
        allConnected: false,
        profiles,
        reason: data.reason,
      };
    const connected = profiles.filter((profile) => profile.connected).length;
    return {
      state: connected === profiles.length ? "connected" : "degraded",
      connected,
      expected: profiles.length,
      allConnected: connected === profiles.length,
      profiles,
    };
  } catch {
    return {
      state: "unavailable",
      connected: 0,
      expected: 4,
      allConnected: false,
      profiles: [],
      reason: "The local AWS connector could not be reached.",
    };
  }
}

async function readAwsInventory(force = false, client?: ClientName): Promise<AwsInventoryState> {
  try {
    const params = new URLSearchParams();
    if (force) params.set("refresh", "1");
    if (client) params.set("client", client);
    const response = await fetch(
      `/api/aws/inventory${params.size ? `?${params}` : ""}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      profiles?: AwsProfileInventory[];
      sync?: AwsInventoryState["sync"];
      reason?: string;
    };
    if (!response.ok || !Array.isArray(data.profiles))
      return { state: "unavailable", profiles: [], reason: data.reason };
    return { state: "ready", profiles: data.profiles, sync: data.sync };
  } catch {
    return {
      state: "unavailable",
      profiles: [],
      reason: "The local AWS inventory service could not be reached.",
    };
  }
}

async function readPortfolioOverview(force = false): Promise<PortfolioState> {
  try {
    const response = await fetch(
      `/api/dashboard/overview${force ? "?refresh=1" : ""}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as PortfolioOverview & {
      reason?: string;
    };
    if (!response.ok || !Array.isArray(data.clients))
      return { state: "unavailable", data: null, reason: data.reason };
    return { state: "ready", data };
  } catch {
    return {
      state: "unavailable",
      data: null,
      reason: "The portfolio overview service could not be reached.",
    };
  }
}

function initialBilling(): BillingByClientView {
  return Object.fromEntries(
    clientOrder.map((name) => [name, clients[name].bills.map((bill) => ({ ...bill }))]),
  ) as BillingByClientView;
}

async function readBillingData(): Promise<BillingByClientView> {
  const response = await fetch("/api/billing/upload", { cache: "no-store" });
  const data = (await response.json()) as { billing?: BillingByClientView; error?: string };
  if (!response.ok || !data.billing) throw new Error(data.error ?? "Billing data is unavailable.");
  return data.billing;
}

function liveServer(instance: LiveInstance): DisplayServer {
  const region =
    instance.region === "ap-south-1"
      ? "Mumbai"
      : instance.region === "ap-south-2"
        ? "Hyderabad"
        : instance.region;
  const lowerName = instance.name.toLowerCase();
  const environment =
    lowerName.includes("prod") &&
    (lowerName.includes("stage") || lowerName.includes("qa"))
      ? "Production / Stage"
      : lowerName.includes("prod")
        ? "Production"
        : lowerName.includes("stage") || lowerName.includes("qa")
          ? "Stage / QA"
          : lowerName.includes("dev")
            ? "Development"
            : "Unclassified";
  const storage = instance.volumes.length
    ? instance.volumes
        .map(
          (volume) =>
            `${volume.sizeGiB ?? "?"} GB ${volume.type ?? "EBS"}${volume.encrypted ? " · encrypted" : ""}`,
        )
        .join(", ")
    : "No attached EBS volume returned";
  return {
    name: instance.name,
    role: "EC2 instance",
    environment,
    state: "documented",
    os: instance.platform,
    cpu: instance.vCpu
      ? `${instance.vCpu} vCPU · ${instance.instanceType}`
      : instance.instanceType,
    memory: instance.memoryMiB
      ? `${formatMemory(instance.memoryMiB)}`
      : "Instance metadata unavailable",
    storage,
    region,
    zone: instance.availabilityZone,
    publicIp: instance.publicIp ?? undefined,
    privateIp: instance.privateIp ?? undefined,
    source: "live",
    instanceId: instance.instanceId,
    liveState: instance.state,
    instanceType: instance.instanceType,
    launchedAt: instance.launchTime,
    vpcId: instance.vpcId,
    subnetId: instance.subnetId,
    securityGroups: instance.securityGroups,
    volumes: instance.volumes,
  };
}

export function StratusApp() {
  const [selectedClient, setSelectedClient] = useState<ClientName>("Nilkamal");
  const [organizationView, setOrganizationView] = useState(true);
  const [activePage, setActivePage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All regions");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantPending, setAssistantPending] = useState(false);
  const [assistantConfig, setAssistantConfig] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [billingByClient, setBillingByClient] = useState<BillingByClientView>(initialBilling);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncStep, setSyncStep] = useState(-1);
  const [syncTarget, setSyncTarget] = useState<"all" | ClientName>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [awsStatus, setAwsStatus] = useState<AwsConnectorStatus>({
    state: "checking",
    connected: 0,
    expected: 4,
    allConnected: false,
    profiles: [],
  });
  const [inventoryState, setInventoryState] = useState<AwsInventoryState>({
    state: "loading",
    profiles: [],
  });
  const [portfolioState, setPortfolioState] = useState<PortfolioState>({
    state: "loading",
    data: null,
  });
  const [selectedServer, setSelectedServer] = useState<DisplayServer | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const refreshRunRef = useRef(false);
  const pricingTriggerRef = useRef<HTMLButtonElement>(null);
  const pricingDrawerRef = useRef<HTMLElement>(null);
  const client = { ...clients[selectedClient], bills: billingByClient[selectedClient] };
  const globalSpend = useMemo(
    () => portfolioState.data?.spend.currentPeriod ?? clientOrder.reduce(
      (sum, name) => sum + (billingByClient[name].at(-1)?.total ?? 0),
      0,
    ),
    [billingByClient, portfolioState.data],
  );
  const selectedInventory = inventoryState.profiles.find(
    (profile) => profile.client === selectedClient,
  );
  const selectedServers: DisplayServer[] = selectedInventory
    ? selectedInventory.instances.map(liveServer)
    : clients[selectedClient].servers.map((server) => ({
        ...server,
        source: "documented",
      }));
  const allServers: Array<DisplayServer & { client: ClientName }> =
    inventoryState.state === "ready"
      ? inventoryState.profiles.flatMap((profile) =>
          profile.instances.map((instance) => ({
            ...liveServer(instance),
            client: profile.client,
          })),
        )
      : clientOrder.flatMap((name) =>
          clients[name].servers.map((server) => ({
            ...server,
            source: "documented" as const,
            client: name,
          })),
        );
  const discoveredServers = allServers.length;
  const searchResults: GlobalSearchResult[] = (() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const matches = (...values: unknown[]) => values.filter((value) => value != null).join(" ").toLowerCase().includes(needle);
    const results: GlobalSearchResult[] = [];
    for (const name of clientOrder) {
      if (matches(name, clients[name].accountId)) results.push({ id: `client:${name}`, title: name, detail: `Managed client · AWS ${clients[name].accountId}`, icon: "clients", page: "Dashboard", client: name });
    }
    for (const item of allServers) {
      if (matches(item.name, item.instanceId, item.privateIp, item.publicIp, item.role, item.environment, item.instanceType, item.region, item.zone)) results.push({ id: `server:${item.client}:${item.instanceId ?? item.name}`, title: item.name, detail: `${item.client} · ${item.instanceId ?? "documented server"} · ${item.privateIp ?? item.publicIp ?? item.region}`, icon: "servers", page: "Infrastructure", client: item.client, server: item });
      for (const volume of item.volumes ?? []) if (matches(volume.volumeId, volume.type, item.name, item.client)) results.push({ id: `volume:${volume.volumeId}`, title: volume.volumeId, detail: `${item.client} · ${item.name} · ${volume.sizeGiB ?? "?"} GiB ${volume.type ?? "EBS"}`, icon: "billing", page: "Infrastructure", client: item.client, server: item });
    }
    for (const profile of inventoryState.profiles) {
      for (const bucket of profile.buckets) if (matches(bucket.name, bucket.region, profile.client)) results.push({ id: `bucket:${profile.client}:${bucket.name}`, title: bucket.name, detail: `${profile.client} · S3 bucket · ${regionName(bucket.region)}`, icon: "cloud", page: "Backups", client: profile.client });
      for (const user of profile.iamUsers) if (matches(user.userName, user.arn, user.groups, user.attachedPolicies, profile.client)) results.push({ id: `iam:${profile.client}:${user.arn}`, title: user.userName, detail: `${profile.client} · IAM user · ${user.groups.length} groups`, icon: "shield", page: "IAM & Security", client: profile.client });
      for (const vpc of profile.network?.vpcs ?? []) if (matches(vpc.vpcId, vpc.cidr, vpc.region, profile.client)) results.push({ id: `vpc:${profile.client}:${vpc.vpcId}`, title: vpc.vpcId, detail: `${profile.client} · VPC · ${vpc.cidr ?? "CIDR unavailable"} · ${regionName(vpc.region)}`, icon: "network", page: "Network", client: profile.client });
      for (const subnet of profile.network?.subnets ?? []) if (matches(subnet.subnetId, subnet.vpcId, subnet.cidr, subnet.availabilityZone, profile.client)) results.push({ id: `subnet:${profile.client}:${subnet.subnetId}`, title: subnet.subnetId, detail: `${profile.client} · Subnet · ${subnet.cidr ?? "CIDR unavailable"} · ${subnet.availabilityZone ?? regionName(subnet.region)}`, icon: "network", page: "Network", client: profile.client });
      for (const vpn of profile.network?.vpns ?? []) if (matches(vpn.vpnConnectionId, vpn.customerGatewayId, vpn.vpnGatewayId, vpn.transitGatewayId, profile.client)) results.push({ id: `vpn:${profile.client}:${vpn.vpnConnectionId}`, title: vpn.vpnConnectionId, detail: `${profile.client} · Site-to-site VPN · ${vpn.state} · ${regionName(vpn.region)}`, icon: "route", page: "Network", client: profile.client });
    }
    const quickActions: GlobalSearchResult[] = [
      { id: "action:upload", title: "Upload AWS bill", detail: "Import and validate a PDF bill summary", icon: "upload", action: "upload" },
      { id: "action:refresh", title: "Refresh all clients", detail: "Run live read-only AWS discovery", icon: "refresh", action: "refresh" },
      { id: "action:assistant", title: "Open Stratus AI", detail: "Ask a source-backed operational question", icon: "sparkles", action: "assistant" },
      ...navGroups.flatMap((group) => group.items.map(([page, icon]) => ({ id: `page:${page}`, title: `Go to ${page}`, detail: "Navigate", icon, page }))),
    ];
    results.push(...quickActions.filter((action) => matches(action.title, action.detail)));
    return results.slice(0, 12);
  })();
  const selectedProfile = awsStatus.profiles.find(
    (profile) => profile.client === selectedClient,
  );
  const scopedSyncProfiles = syncTarget === "all" ? inventoryState.profiles : inventoryState.profiles.filter((profile) => profile.client === syncTarget);
  const completedSyncErrors = scopedSyncProfiles.reduce((sum, profile) => sum + profile.errors.length, 0);
  const syncProfilesConnected = syncTarget === "all" ? awsStatus.allConnected : Boolean(awsStatus.profiles.find((profile) => profile.client === syncTarget)?.connected);
  const syncHasIssues = syncStep >= serviceSteps.length && (!syncProfilesConnected || inventoryState.state !== "ready" || completedSyncErrors > 0);

  useEffect(() => {
    let active = true;
    void readPortfolioOverview().then((portfolio) => {
      if (active) setPortfolioState(portfolio);
    });
    void Promise.all([readAwsConnectorStatus(), readAwsInventory()]).then(
      async ([status, inventory]) => {
        if (!active) return;
        setAwsStatus(status);
        setInventoryState(inventory);
        const portfolio = await readPortfolioOverview();
        if (active) setPortfolioState(portfolio);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void readBillingData()
      .then((billing) => {
        if (active) setBillingByClient(billing);
      })
      .catch(() => {
        // The bundled historical summaries remain visible if local persistence is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!assistantOpen) return;
    let active = true;
    void fetch("/api/ai/ask", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { configured?: boolean; model?: string }) => {
        if (active)
          setAssistantConfig({
            configured: Boolean(data.configured),
            model: data.model ?? "gpt-5.4-mini",
          });
      })
      .catch(() => {
        if (active)
          setAssistantConfig({ configured: false, model: "gpt-5.4-mini" });
      });
    return () => {
      active = false;
    };
  }, [assistantOpen]);

  useEffect(() => {
    if (!pricingOpen) return;
    const drawer = pricingDrawerRef.current;
    const focusable = () => [
      ...(drawer?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPricingOpen(false);
        pricingTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]!,
        last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pricingOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setQuery("");
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (page: string) => {
    setActivePage(page);
    if (page === "Dashboard") setOrganizationView(true);
    setQuery("");
    setSelectedServer(null);
  };
  const refresh = async (target: "all" | ClientName = "all") => {
    if (refreshRunRef.current) return;
    refreshRunRef.current = true;
    setIsRefreshing(true);
    setSyncTarget(target);
    setSyncOpen(true);
    setSyncStep(0);
    setPortfolioState((current) => ({
      ...current,
      state: current.data ? "refreshing" : "loading",
    }));
    try {
      const status = await readAwsConnectorStatus(true);
      setAwsStatus(status);
      setSyncStep(1);
      const inventory = await readAwsInventory(true, target === "all" ? undefined : target);
      setInventoryState(inventory);
      setSyncStep(2);
      const portfolio = await readPortfolioOverview();
      setPortfolioState(portfolio);
      setSyncStep(serviceSteps.length);
    } finally {
      refreshRunRef.current = false;
      setIsRefreshing(false);
    }
  };
  const handleUpload = async (file?: File) => {
    if (!file) return;
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setUploadState("error");
      setUploadMessage("Only PDF bill summaries are accepted.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadState("error");
      setUploadMessage("This file exceeds the 10 MB upload limit.");
      return;
    }
    setUploadState("uploading");
    setUploadMessage("Reading and validating the AWS bill…");
    const form = new FormData();
    form.append("bill", file);
    try {
      const response = await fetch("/api/billing/upload", { method: "POST", body: form });
      const data = (await response.json()) as {
        bill?: { client: ClientName; month: string; year: number; totalCents: number };
        billing?: BillingByClientView;
        replaced?: boolean;
        error?: string;
      };
      if (!response.ok || !data.bill || !data.billing) throw new Error(data.error ?? "The bill could not be imported.");
      setBillingByClient(data.billing);
      setSelectedClient(data.bill.client);
      setUploadState("success");
      setUploadMessage(
        `${data.bill.client} · ${data.bill.month} ${data.bill.year} imported at ${usd.format(data.bill.totalCents / 100)}${data.replaced ? " · existing period updated" : ""}.`,
      );
      void readPortfolioOverview().then(setPortfolioState);
    } catch (error) {
      setUploadState("error");
      setUploadMessage(error instanceof Error ? error.message : "The bill could not be imported.");
    }
  };
  const localAssistantAnswer = (question: string) => {
    const q = question.toLowerCase();
    if (
      (q.includes("why") || q.includes("increase") || q.includes("decrease")) &&
      q.includes("bill")
    ) {
      const namedClient =
        clientOrder.find((name) => q.includes(name.toLowerCase())) ??
        selectedClient;
      const history = billingByClient[namedClient],
        latest = history.at(-1)!,
        previous = history.at(-2)!;
      const change = latest.total - previous.total,
        percent = previous.total ? (change / previous.total) * 100 : 0;
      return `${namedClient}'s ${latest.month} bill ${change >= 0 ? "increased" : "decreased"} by ${usd.format(Math.abs(change))} (${Math.abs(percent).toFixed(1)}%) from ${usd.format(previous.total)} in ${previous.month} to ${usd.format(latest.total)}. Its top recorded service was ${latest.topService} at ${usd.format(latest.topServiceCost)}. The supplied bill summary does not include enough service-level line items to attribute the entire change more precisely.`;
    }
    if (q.includes("highest") && q.includes("cost"))
      return `Nilkamal's latest loaded bill is ${usd.format(billingByClient.Nilkamal.at(-1)!.total)}.`;
    if (q.includes("public ip"))
      return (
        allServers
          .filter((s) => s.publicIp)
          .map((s) => `${s.client}: ${s.name} — ${s.publicIp}`)
          .join("\n") || "No public IPs were returned."
      );
    if (q.includes("gcpl") && q.includes("ec2"))
      return `GCPL EC2 spend across the loaded periods: ${billingByClient.GCPL.map((b) => `${b.month} ${usd.format(b.topServiceCost)}`).join(", ")}.`;
    if (q.includes("stopped"))
      return inventoryState.state === "ready"
        ? allServers
            .filter((server) => server.liveState === "stopped")
            .map(
              (server) =>
                `${server.client}: ${server.name} (${server.instanceId})`,
            )
            .join("\n") || "No stopped EC2 instances were returned."
        : "The live inventory is unavailable, so Stratus will not guess.";
    if (q.includes("failed") && q.includes("backup"))
      return "S3 backup objects do not expose a job failure state; review missing or stale backup warnings.";
    if (q.includes("admin") && (q.includes("iam") || q.includes("user")))
      return inventoryState.state === "ready"
        ? inventoryState.profiles
            .flatMap((profile) =>
              (profile.iamUsers ?? [])
                .filter((user) => user.administratorAccess)
                .map(
                  (user) =>
                    `${profile.client}: ${user.userName} — ${user.administratorEvidence.join("; ")}`,
                ),
            )
            .join("\n") ||
            "No administrator-equivalent IAM user policies were confirmed."
        : "IAM inventory is unavailable.";
    if (q.includes("vpn") || q.includes("unused"))
      return "That question needs additional AWS service discovery that is not collected yet. Stratus will not guess.";
    return "OpenAI is unavailable for this request, and the question is outside the built-in source-backed checks.";
  };
  const askAssistant = async (question: string) => {
    setAssistantQuestion(question);
    setAssistantAnswer("Analyzing the current source snapshot…");
    setAssistantPending(true);
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, selectedClient }),
      });
      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        model?: string;
      };
      if (!response.ok || !data.answer)
        throw new Error(data.error ?? "The assistant returned no answer.");
      setAssistantAnswer(data.answer);
      setAssistantConfig({
        configured: true,
        model: data.model ?? assistantConfig?.model ?? "gpt-5.4-mini",
      });
    } catch (error) {
      const fallback = localAssistantAnswer(question);
      setAssistantAnswer(
        fallback.startsWith("OpenAI is unavailable") && error instanceof Error
          ? error.message
          : fallback,
      );
    } finally {
      setAssistantPending(false);
    }
  };
  const exportCsv = (kind: "billing" | "infrastructure") => {
    const csv =
      kind === "billing"
        ? [
            "client,month,total_usd,pre_tax_usd,top_service,top_service_cost",
            ...clientOrder.flatMap((name) =>
              billingByClient[name].map((b) =>
                [
                  name,
                  `${b.month} ${b.year}`,
                  b.total.toFixed(2),
                  b.preTax.toFixed(2),
                  b.topService,
                  b.topServiceCost.toFixed(2),
                ].map(csvCell).join(","),
              ),
            ),
          ].join("\n")
        : [
            "client,resource,instance_id,state,instance_type,environment,os,region,zone,private_ip,public_ip,storage",
            ...allServers.map((s) =>
              [
                s.client,
                s.name,
                s.instanceId ?? "",
                s.liveState ?? "documented",
                s.instanceType ?? "",
                s.environment,
                s.os,
                s.region,
                s.zone,
                s.privateIp ?? "",
                s.publicIp ?? "",
                s.storage,
              ]
                .map(csvCell)
                .join(","),
            ),
          ].join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `stratus-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="stratus-shell"
      style={
        {
          "--client-accent": organizationView ? "#078a83" : client.accent,
        } as React.CSSProperties
      }
    >
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("Dashboard")}>
          <span className="brand-cloud">
            <AppIcon name="cloud" size={27} />
          </span>
          <span>
            <strong>Stratus</strong>
            <small>Inventrax Cloud Operations</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          {navGroups.map((group, index) => (
            <section className="nav-group" key={group.label ?? index}>
              {group.label && <p>{group.label}</p>}
              {group.items.map(([item, icon]) => (
                <button
                  onClick={() => navigate(item)}
                  className={activePage === item ? "active" : ""}
                  key={item}
                  aria-current={activePage === item ? "page" : undefined}
                >
                  <span aria-hidden>
                    <AppIcon name={icon} />
                  </span>
                  {item}
                </button>
              ))}
            </section>
          ))}
          <section className="nav-group">
            <p>Tools</p>
            <button
              ref={pricingTriggerRef}
              onClick={() => setPricingOpen(true)}
              aria-expanded={pricingOpen}
            >
              <span aria-hidden>
                <AppIcon name="dollar" />
              </span>
              AWS Pricing
            </button>
          </section>
        </nav>
        <section className="managed-clients" aria-label="Managed clients">
          <p>Managed Clients</p>
          {clientOrder.map((name) => (
            <button
              key={name}
              onClick={() => {
                setOrganizationView(false);
                setSelectedClient(name);
                setActivePage("Dashboard");
                setSelectedServer(null);
              }}
              className={
                !organizationView && name === selectedClient ? "active" : ""
              }
            >
              <i style={{ background: clients[name].accent }}>
                {clients[name].initials}
              </i>
              <span>{name}</span>
              <b
                className={
                  awsStatus.profiles.find((profile) => profile.client === name)
                    ?.connected
                    ? "online"
                    : ""
                }
                aria-label={
                  awsStatus.profiles.find((profile) => profile.client === name)
                    ?.connected
                    ? "Connected"
                    : "Unavailable"
                }
              />
            </button>
          ))}
        </section>
        {!organizationView && (
          <div className="sidebar-art" aria-hidden="true">
            <img
              key={selectedClient}
              src={clientArtwork[selectedClient]}
              alt=""
            />
          </div>
        )}
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">{activePage.toUpperCase()}</p>
            <h1>
              {activePage === "Dashboard"
                ? organizationView
                  ? "Cloud Operations Overview"
                  : `${selectedClient} overview`
                : activePage}
            </h1>
            <p>
              {activePage === "Dashboard" && organizationView
                ? "All managed AWS environments"
                : `${organizationView ? "Portfolio" : selectedClient} · read-only operations workspace`}
            </p>
          </div>
          <label className="search">
            <span aria-hidden>
              <AppIcon name="search" size={16} />
            </span>
            <span className="sr-only">Search resources</span>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search servers, IPs, clients…"
            />
            <kbd>⌘ K</kbd>
          </label>
          <button
            className="outline-button"
            onClick={() => setUploadOpen(true)}
          >
            <AppIcon name="upload" size={15} /> Upload bill
          </button>
          <button className="refresh-button" onClick={() => void refresh("all")} disabled={isRefreshing} aria-busy={isRefreshing}>
            <AppIcon name="refresh" size={15} /> {isRefreshing ? "Refreshing clients…" : "Refresh all clients"}
          </button>
          <div className="admin-profile" aria-label="Signed in as Admin">
            <span>A</span>
            <div>
              <strong>Admin</strong>
              <small>Operations</small>
            </div>
            <i />
          </div>
          {query.trim().length > 1 && (
            <div className="search-popover" role="listbox">
              {searchResults.length ? searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => {
                    if (result.page) navigate(result.page);
                    if (result.client) {
                      setSelectedClient(result.client);
                      setOrganizationView(false);
                    }
                    if (result.server) setSelectedServer(result.server);
                    if (result.action === "upload") setUploadOpen(true);
                    if (result.action === "refresh") void refresh("all");
                    if (result.action === "assistant") setAssistantOpen(true);
                    setQuery("");
                  }}
                >
                  <span>
                    <AppIcon name={result.icon} size={16} />
                  </span>
                  <div>
                    <strong>{result.title}</strong>
                    <small>{result.detail}</small>
                  </div>
                </button>
              )) : <div className="search-empty"><strong>No matching Stratus data</strong><small>Try a client, instance ID, IP, VPC, volume, bucket, IAM user, service, or page.</small></div>}
            </div>
          )}
        </header>

        <div className="content">
          {activePage === "Dashboard" &&
            (organizationView ? (
              <OrganizationDashboard
                portfolio={portfolioState}
                selectClient={(name) => {
                  setSelectedClient(name);
                  setOrganizationView(false);
                }}
                refresh={() => void refresh("all")}
                openBackups={() => navigate("Backups")}
              />
            ) : (
              <Dashboard
                clientName={selectedClient}
                bills={billingByClient[selectedClient]}
                navigate={navigate}
                globalSpend={globalSpend}
                globalSpendNote={portfolioState.data ? `${portfolioState.data.spend.currentPeriodLabel} · ${portfolioState.data.spend.currentClientsLoaded}/${portfolioState.data.spend.totalClients} clients loaded` : "Latest available source totals"}
                allServerCount={discoveredServers}
                servers={selectedServers}
                inventory={selectedInventory}
                inventoryState={inventoryState.state}
                refresh={() => void refresh(selectedClient)}
                profileStatus={selectedProfile}
              />
            ))}
          {activePage === "Clients" && (
            <ClientDirectory
              portfolio={portfolioState.data}
              billing={billingByClient}
              selectClient={(name) => {
                setSelectedClient(name);
                setOrganizationView(false);
                setActivePage("Dashboard");
              }}
            />
          )}
          {activePage === "Billing" &&
            (organizationView ? (
              <PortfolioBilling overview={portfolioState.data} />
            ) : (
              <BillingPage
                clientName={selectedClient}
                bills={billingByClient[selectedClient]}
                onUpload={() => setUploadOpen(true)}
              />
            ))}
          {activePage === "Infrastructure" && (
            <ServersPage
              liveServers={organizationView ? allServers : selectedServers}
              inventoryState={inventoryState.state}
              regionFilter={regionFilter}
              setRegionFilter={setRegionFilter}
              selectedServer={selectedServer}
              setSelectedServer={setSelectedServer}
            />
          )}
          {activePage === "Backups" &&
            (organizationView ? (
              <PortfolioBackups overview={portfolioState.data} />
            ) : (
              <BackupsPage
                clientName={selectedClient}
                inventory={selectedInventory}
                inventoryState={inventoryState.state}
              />
            ))}
          {activePage === "Network" && (
            <NetworkPage
              clientName={selectedClient}
              servers={selectedServers}
              inventory={selectedInventory}
              inventoryState={inventoryState.state}
            />
          )}
          {activePage === "IAM & Security" && (
            <SecurityPage
              clientName={selectedClient}
              inventory={selectedInventory}
              inventoryState={inventoryState.state}
            />
          )}
          {activePage === "Alerts" && (
            <AlertsPage
              clientName={selectedClient}
              refresh={() => void refresh(selectedClient)}
              profileStatus={selectedProfile}
              inventory={selectedInventory}
              inventoryState={inventoryState.state}
            />
          )}
          {activePage === "Reports" && <ReportsPage exportCsv={exportCsv} />}
          {activePage === "Settings" && <SettingsPage status={awsStatus} sync={inventoryState.sync} />}
        </div>
      </main>

      <button
        className="ai-button"
        aria-label="Open Stratus AI assistant"
        onClick={() => setAssistantOpen((open) => !open)}
        aria-expanded={assistantOpen}
      >
        <span>
          <AppIcon name="sparkles" size={22} />
        </span>
        <b>Ask AI</b>
      </button>
      {assistantOpen && (
        <Assistant
          question={assistantQuestion}
          answer={assistantAnswer}
          ask={askAssistant}
          close={() => setAssistantOpen(false)}
          pending={assistantPending}
          config={assistantConfig}
        />
      )}
      {pricingOpen && (
        <div
          className="pricing-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPricingOpen(false);
              pricingTriggerRef.current?.focus();
            }
          }}
        >
          <aside
            ref={pricingDrawerRef}
            className="pricing-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="AWS Pricing"
          >
            <header>
              <div>
                <p className="eyebrow">AWS ESTIMATION</p>
                <h2>AWS Pricing</h2>
              </div>
              <button
                aria-label="Close pricing"
                onClick={() => {
                  setPricingOpen(false);
                  pricingTriggerRef.current?.focus();
                }}
              >
                <AppIcon name="close" />
              </button>
            </header>
            <PricingPage />
          </aside>
        </div>
      )}
      {uploadOpen && (
        <Modal
          title="Upload AWS bill summary"
          close={() => {
            setUploadOpen(false);
            setUploadMessage("");
            setUploadState("idle");
          }}
        >
          <button
            className={`drop-zone ${uploadState}`}
            onClick={() => fileRef.current?.click()}
            disabled={uploadState === "uploading"}
            aria-busy={uploadState === "uploading"}
          >
            <span>
              <AppIcon name="upload" size={28} />
            </span>
            <strong>{uploadState === "uploading" ? "Importing AWS bill…" : "Choose a PDF bill summary"}</strong>
            <small>
              Maximum 10 MB · source files are discarded after parsing
            </small>
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              void handleUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <p className={`modal-message ${uploadState}`} aria-live="polite">
            {uploadMessage ||
              "The client and billing period will be detected from the AWS account ID inside the PDF."}
          </p>
        </Modal>
      )}
      {syncOpen && (
        <Modal title={syncTarget === "all" ? "Refresh all clients" : `Refresh ${syncTarget}`} close={() => setSyncOpen(false)}>
          <div className="sync-overview">
            <span>{syncStep >= serviceSteps.length ? syncHasIssues ? "!" : "✓" : "↻"}</span>
            <div>
              <strong>
                {syncStep >= serviceSteps.length
                  ? syncHasIssues ? "Refresh completed with source issues" : syncTarget === "all" ? "All client inventories refreshed" : `${syncTarget} inventory refreshed`
                  : syncTarget === "all" ? "Refreshing four AWS accounts" : `Refreshing ${syncTarget}`}
              </strong>
              <small>
                {syncStep >= serviceSteps.length
                  ? `${inventoryState.profiles.length}/4 profiles returned`
                  : "This can take a moment while S3 metadata is paginated."}
              </small>
            </div>
          </div>
          <div className="sync-list">
            {serviceSteps.map((step, index) => (
              <div key={step}>
                <span
                  className={
                    syncStep > index
                      ? "done"
                      : index === syncStep
                        ? "running"
                        : "pending"
                  }
                >
                  {syncStep > index ? "✓" : index === syncStep ? "↻" : "·"}
                </span>
                <strong>{step}</strong>
                <small>
                  {syncStep > index
                    ? syncAllResult(step, inventoryState.profiles, awsStatus, syncTarget)
                    : index === syncStep
                      ? step === "Profile validation"
                        ? "Verifying configured profiles…"
                        : step === "AWS inventory"
                          ? "Discovering EC2, EBS, S3 backups, and IAM metadata…"
                          : "Recalculating portfolio summaries…"
                      : "Queued"}
                </small>
              </div>
            ))}
          </div>
          {syncStep >= serviceSteps.length && (
            <p className={`modal-message ${syncHasIssues ? "error" : "success"}`}>
              {syncHasIssues ? `${completedSyncErrors} service-level discovery issue${completedSyncErrors === 1 ? "" : "s"} returned. Existing data is retained where a collector failed.` : syncTarget === "all" ? "Live read-only discovery completed across all configured clients." : `Live read-only discovery completed for ${syncTarget}.`}
              {` The selected workspace remains ${selectedClient}.`}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function OrganizationDashboard({
  portfolio,
  selectClient,
  refresh,
  openBackups,
}: {
  portfolio: PortfolioState;
  selectClient: (name: ClientName) => void;
  refresh: () => void;
  openBackups: () => void;
}) {
  const overview = portfolio.data;
  if (!overview)
    return (
      <div className="page-stack org-dashboard">
        <section className="notice notice-loading">
          <span>↻</span>
          <div>
            <strong>
              {portfolio.state === "unavailable"
                ? "Portfolio data unavailable"
                : "Connecting to managed AWS environments"}
            </strong>
            <p>
              {portfolio.reason ??
                "The dashboard will populate as each source responds."}
            </p>
          </div>
          <button onClick={refresh}>Try again</button>
        </section>
        <section className="org-kpis skeleton-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <article className="kpi skeleton-card" key={index} />
          ))}
        </section>
      </div>
    );
  const max = Math.max(
    ...overview.spend.sixMonthSeries.map((month) => month.total),
  );
  const healthTone =
    overview.partial || overview.backups.attention ? "warning" : "success";
  const latestAwsRefresh = overview.sources.filter((source) => source.service === "AWS" && source.fetchedAt).map((source) => source.fetchedAt!).sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  const billingPartial = overview.sources.some((source) => source.service === "Billing" && source.status !== "healthy");
  return (
    <div className="page-stack org-dashboard">
      <section className={`notice ${overview.partial ? "notice-partial" : ""}`}>
        <span>{overview.partial ? "!" : "✓"}</span>
        <div>
          <strong>
            {overview.partial
              ? "Partial AWS data"
              : "All portfolio sources synchronized"}
          </strong>
          <p>
            {portfolio.state === "refreshing"
              ? "Refreshing in the background · existing values preserved"
              : `Overview assembled ${formatDateTime(overview.generatedAt)} · AWS snapshot ${formatRelative(latestAwsRefresh)}`}
          </p>
        </div>
        <button onClick={refresh}>
          {portfolio.state === "refreshing" ? "Refreshing…" : "Refresh"}
        </button>
      </section>
      <section className="org-kpis" aria-label="Portfolio key metrics">
        <Kpi
          icon="clients"
          title="Managed clients"
          value={String(overview.clients.length)}
          note={`${overview.sources.filter((source) => source.service === "AWS" && source.status === "healthy").length}/${overview.clients.length} AWS profiles healthy`}
          tone={overview.partial ? "warning" : "success"}
        />
        <Kpi
          icon="dollar"
          title="Current AWS spend"
          value={usd.format(overview.spend.currentPeriod)}
          note={
            !overview.spend.comparable
              ? `${overview.spend.currentPeriodLabel} · ${overview.spend.currentClientsLoaded}/${overview.spend.totalClients} clients loaded`
              : overview.spend.changePercent == null
                ? `${overview.spend.currentPeriodLabel} · comparison unavailable`
              : `${formatPercent(overview.spend.changePercent, true)} vs prior period`
          }
          tone={(overview.spend.changePercent ?? 0) > 0 ? "warning" : "success"}
        />
        <Kpi
          icon="servers"
          title="EC2 fleet"
          value={`${overview.compute.total} instances`}
          note={`${overview.compute.running} running · ${overview.compute.stopped} stopped${overview.compute.other ? ` · ${overview.compute.other} other` : ""}`}
        />
        <Kpi
          icon="billing"
          title="EBS provisioned storage"
          value={formatGiB(overview.storage.ebsGiB)}
          note="Attached volumes · deduplicated"
        />
        <Kpi
          icon="check"
          title="S3 backup health"
          value={`${overview.backups.healthy}/${overview.backups.totalExpected}`}
          note={`${overview.backups.attention} backup types need attention`}
          tone={healthTone}
        />
        <Kpi
          icon="alert"
          title="Needs attention"
          value={String(overview.attention.length)}
          note={
            overview.attention.length
              ? "Detected source and backup conditions"
              : "No actionable conditions"
          }
          tone={overview.attention.length ? "warning" : "success"}
        />
      </section>
      <section className="portfolio-grid">
        <article className="panel portfolio-spend">
          <PanelTitle title="6-Month AWS Spend" />
          <div
            className="stacked-chart"
            aria-label="Six-month AWS spend stacked by managed client"
          >
            {overview.spend.sixMonthSeries.map((month) => (
              <div className="stacked-column" key={month.month}>
                <span>{usd.format(month.total)}</span>
                <div
                  style={{
                    height: `${Math.max(18, (month.total / max) * 100)}%`,
                  }}
                >
                  {month.values.map((entry) => (
                    <i
                      key={entry.client}
                      title={`${entry.client}: ${usd.format(entry.value)}`}
                      style={{
                        height: `${month.total ? (entry.value / month.total) * 100 : 0}%`,
                        background: entry.accent,
                      }}
                    />
                  ))}
                </div>
                <b>{month.month}</b>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            {overview.spend.byClient.map((entry) => (
              <span key={entry.client}>
                <i style={{ background: entry.accent }} />
                {entry.client}
              </span>
            ))}
          </div>
        </article>
        <article className="panel portfolio-cost">
          <PanelTitle title="Current Cost by Client" />
          <div
            className="portfolio-donut"
            style={{ background: costDonut(overview.spend.byClient) }}
          >
            <div>
              <strong>{usd.format(overview.spend.currentPeriod)}</strong>
              <span>{overview.spend.currentPeriodLabel}</span>
            </div>
          </div>
          <div className="cost-client-list">
            {overview.spend.byClient.map((entry) => (
              <div key={entry.client}>
                <i style={{ background: entry.accent }} />
                <span>{entry.client}</span>
                <b>{usd.format(entry.value)}</b>
              </div>
            ))}
          </div>
        </article>
        <article className="panel portfolio-backups">
          <PanelTitle
            title="S3 Backup Health"
            action="View details"
            onAction={openBackups}
          />
          <div className="backup-health-table table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workload</th>
                  <th>AMI</th>
                  <th>Full</th>
                  <th>Differential</th>
                  <th>Transactional</th>
                  <th>Health</th>
                  <th>Today</th>
                </tr>
              </thead>
              <tbody>
                {overview.backups.workloads.map((workload) => (
                  <tr key={workload.workload}>
                    <td>
                      <strong>{workload.workload}</strong>
                    </td>
                    {(
                      ["ami", "full", "differential", "transactional"] as const
                    ).map((type) => {
                      const state = workload.types.find(
                        (item) => item.type === type,
                      );
                      return (
                        <td key={type}>
                          <span
                            className={`status-pill ${state?.healthy ? "healthy" : "attention"}`}
                          >
                            {state?.latestAt
                              ? new Intl.DateTimeFormat("en-IN", {
                                  timeZone: "Asia/Kolkata",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(state.latestAt))
                              : "Missing"}
                          </span>
                        </td>
                      );
                    })}
                    <td>
                      <span
                        className={`status-pill ${workload.healthy === workload.expected ? "healthy" : "attention"}`}
                      >
                        {workload.healthy}/{workload.expected}
                      </span>
                    </td>
                    <td>{formatBytes(workload.todayBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="panel portfolio-clients">
          <PanelTitle title="Client Overview" />
          <div className="org-client-grid">
            {overview.clients.map((item) => (
              <button key={item.id} onClick={() => selectClient(item.name)}>
                <header>
                  <i style={{ background: item.accent }}>
                    {clients[item.name].initials}
                  </i>
                  <div>
                    <strong>{item.name}</strong>
                    <small>Open dashboard →</small>
                  </div>
                </header>
                <b>{usd.format(item.currentSpend)}</b>
                <p>
                  <span>{item.compute.running} running</span>
                  <span>{item.compute.stopped} stopped</span>
                  <span>{formatGiB(item.ebsGiB)}</span>
                </p>
                <footer
                  className={item.status === "healthy" ? "good" : "warning"}
                >
                  {item.status === "healthy"
                    ? "Environment healthy"
                    : item.status === "unavailable"
                      ? "AWS unavailable"
                      : "Attention required"}
                </footer>
              </button>
            ))}
          </div>
        </article>
        <article className="panel portfolio-attention">
          <PanelTitle title="Attention Required" />
          <div className="attention-list">
            {overview.attention.length ? (
              overview.attention.slice(0, 5).map((item, index) => (
                <button
                  key={`${item.client}-${item.title}-${index}`}
                  onClick={() => selectClient(item.client)}
                >
                  <span>
                    <AppIcon name="alert" size={14} />
                  </span>
                  <div>
                    <strong>
                      {item.client} · {item.title}
                    </strong>
                    <small>{item.detail}</small>
                  </div>
                  <b>→</b>
                </button>
              ))
            ) : (
              <Empty
                title="No actionable conditions"
                text="Every configured source and backup expectation is currently healthy."
              />
            )}
          </div>
        </article>
        <article className="panel portfolio-drivers">
          <PanelTitle title="Top AWS Cost Drivers" />
          <div className="driver-list">
            {overview.spend.byService.map((item) => (
              <div key={item.service}>
                <span>
                  <b>{item.service}</b>
                  <small>{usd.format(item.value)}</small>
                </span>
                <i>
                  <b
                    style={{
                      width: `${overview.spend.currentPeriod ? Math.max(0, Math.min(100, (item.value / overview.spend.currentPeriod) * 100)) : 0}%`,
                    }}
                  />
                </i>
              </div>
            ))}
          </div>
        </article>
        <article className="panel portfolio-status">
          <PanelTitle title="System Status" />
          <div className="system-status-list">
            <div>
              <span>AWS profiles</span>
              <b>
                {
                  overview.sources.filter(
                    (source) =>
                      source.service === "AWS" && source.status === "healthy",
                  ).length
                }
                /{overview.clients.length}
              </b>
            </div>
            <div>
              <span>Billing data</span>
              <b className={billingPartial ? "warning" : "good"}>{billingPartial ? `${overview.spend.currentClientsLoaded}/${overview.spend.totalClients} current` : "Healthy"}</b>
            </div>
            <div>
              <span>S3 discovery</span>
              <b
                className={
                  overview.sources.some(
                    (source) =>
                      source.service === "S3" && source.status !== "healthy",
                  )
                    ? "warning"
                    : "good"
                }
              >
                {overview.sources.some(
                  (source) =>
                    source.service === "S3" && source.status !== "healthy",
                )
                  ? "Partial"
                  : "Healthy"}
              </b>
            </div>
            <div>
              <span>Last full refresh</span>
              <b>{formatRelative(latestAwsRefresh)}</b>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function ClientDirectory({
  portfolio,
  billing,
  selectClient,
}: {
  portfolio: PortfolioOverview | null;
  billing: BillingByClientView;
  selectClient: (name: ClientName) => void;
}) {
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">MANAGED CLIENTS</p>
          <h2>Client environments</h2>
          <p>
            Four isolated AWS accounts managed through configured read-only
            profiles.
          </p>
        </div>
      </section>
      <article className="panel portfolio-clients">
        <div className="org-client-grid directory-grid">
          {clientOrder.map((name) => {
            const item = portfolio?.clients.find(
              (client) => client.name === name,
            );
            return (
              <button key={name} onClick={() => selectClient(name)}>
                <header>
                  <i style={{ background: clients[name].accent }}>
                    {clients[name].initials}
                  </i>
                  <div>
                    <strong>{name}</strong>
                    <small>{clients[name].accountId}</small>
                  </div>
                </header>
                <b>
                  {usd.format(
                    item?.currentSpend ?? billing[name].at(-1)!.total,
                  )}
                </b>
                <p>
                  <span>
                    {item
                      ? `${item.compute.total} EC2`
                      : "Inventory unavailable"}
                  </span>
                  <span>
                    {item
                      ? formatGiB(item.ebsGiB)
                      : clients[name].primaryRegion}
                  </span>
                </p>
                <footer
                  className={item?.status === "healthy" ? "good" : "warning"}
                >
                  {item?.status === "healthy"
                    ? "Healthy"
                    : item?.status === "unavailable"
                      ? "AWS unavailable"
                      : "Review environment"}{" "}
                  →
                </footer>
              </button>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function PortfolioBilling({
  overview,
}: {
  overview: PortfolioOverview | null;
}) {
  if (!overview)
    return (
      <Empty
        title="Portfolio billing unavailable"
        text="The normalized dashboard service did not return billing data."
      />
    );
  const max = Math.max(
    ...overview.spend.sixMonthSeries.map((month) => month.total),
  );
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">PORTFOLIO BILLING</p>
          <h2>AWS spend across managed clients</h2>
          <p>
            All totals reconcile to the same six-month client billing dataset.
          </p>
        </div>
        <span className="source-badge">USD · source totals</span>
      </section>
      <section className="summary-grid">
        <Kpi
          icon="dollar"
          title="Current period"
          value={usd.format(overview.spend.currentPeriod)}
          note={`${formatPercent(overview.spend.changePercent ?? 0, true)} vs prior period`}
        />
        <Kpi
          icon="billing"
          title="Previous period"
          value={usd.format(overview.spend.previousPeriod)}
          note="Equivalent source period"
        />
        <Kpi
          icon="clients"
          title="Client accounts"
          value={String(overview.clients.length)}
          note="Reconciled client totals"
        />
        <Kpi
          icon="sigma"
          title="Six-month average"
          value={usd.format(
            average(overview.spend.sixMonthSeries.map((month) => month.total)),
          )}
          note="Portfolio monthly average"
        />
      </section>
      <section className="page-grid">
        <article className="panel wide">
          <PanelTitle title="Six-month portfolio spend" />
          <div className="billing-bars">
            {overview.spend.sixMonthSeries.map((month) => (
              <div key={month.month}>
                <span>
                  <b>{month.month} {month.year}</b>
                  <small>{usd.format(month.total)}</small>
                </span>
                <i>
                  <b style={{ width: `${(month.total / max) * 100}%` }} />
                </i>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <PanelTitle title="Current cost by client" />
          <div className="cost-client-list padded">
            {overview.spend.byClient.map((item) => (
              <div key={item.client}>
                <i style={{ background: item.accent }} />
                <span>{item.client}</span>
                <b>{usd.format(item.value)}</b>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function PortfolioBackups({
  overview,
}: {
  overview: PortfolioOverview | null;
}) {
  if (!overview)
    return (
      <Empty
        title="S3 backup summary unavailable"
        text="No normalized backup data was returned."
      />
    );
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">S3 BACKUP MONITORING</p>
          <h2>Backup health across workloads</h2>
          <p>
            Metadata-only discovery from configured S3 prefixes. Backup files
            are never downloaded.
          </p>
        </div>
        <span
          className={`source-badge ${overview.backups.attention ? "warning" : ""}`}
        >
          {overview.backups.healthy}/{overview.backups.totalExpected} healthy
        </span>
      </section>
      <article className="panel portfolio-backups">
        <div className="backup-health-table table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workload</th>
                <th>AMI / Application</th>
                <th>Full</th>
                <th>Differential</th>
                <th>Transactional</th>
                <th>Today&apos;s volume</th>
              </tr>
            </thead>
            <tbody>
              {overview.backups.workloads.map((workload) => (
                <tr key={workload.workload}>
                  <td>
                    <strong>{workload.workload}</strong>
                    <small>
                      {workload.healthy}/{workload.expected} healthy
                    </small>
                  </td>
                  {(
                    ["ami", "full", "differential", "transactional"] as const
                  ).map((type) => {
                    const row = workload.types.find(
                      (entry) => entry.type === type,
                    );
                    return (
                      <td key={type}>
                        <span
                          className={`status-pill ${row?.healthy ? "healthy" : "attention"}`}
                        >
                          {row?.healthy
                            ? "Healthy"
                            : row?.latestAt
                              ? "Overdue"
                              : "Missing"}
                        </span>
                        {row?.latestAt && (
                          <small>{formatDateTime(row.latestAt)}</small>
                        )}
                      </td>
                    );
                  })}
                  <td>{formatBytes(workload.todayBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

function SettingsPage({ status, sync }: { status: AwsConnectorStatus; sync?: AwsInventoryState["sync"] }) {
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h2>Connection configuration</h2>
          <p>
            Read-only local AWS profiles and server-side application
            configuration.
          </p>
        </div>
      </section>
      <section className="detail-grid">
        <Detail
          title="AWS connector"
          rows={[
            ["Provider", "Named profiles (local)"],
            ["Profiles", `${status.connected}/${status.expected} connected`],
            ["Regions", "Mumbai · Hyderabad"],
            ["Permissions", "Read-only discovery"],
          ]}
        />
        <Detail
          title="Deployment readiness"
          rows={[
            ["Local runtime", "Docker Compose"],
            ["AWS credentials", "Server-side only"],
            ["Pricing", `Static snapshot ${PRICING_SNAPSHOT_DATE}`],
            [
              "Future hosting",
              "Environment credentials or secure IAM connector required",
            ],
          ]}
        />
        <Detail title="Synchronization schedule" rows={[
          ["General infrastructure", `Every 7 days · last ${sync?.general.lastCompletedAt ? formatDateTime(sync.general.lastCompletedAt) : "not completed"}`],
          ["S3 backup metadata", `Every 24 hours · last ${sync?.backups.lastCompletedAt ? formatDateTime(sync.backups.lastCompletedAt) : "not completed"}`],
          ["Restart behavior", "Persisted snapshot is served immediately; missed schedules resume once"],
          ["Manual refresh", "Current client from its dashboard · all clients from the header"],
        ]} />
      </section>
    </div>
  );
}

function Dashboard({
  clientName,
  bills,
  navigate,
  globalSpend,
  globalSpendNote,
  allServerCount,
  servers,
  inventory,
  inventoryState,
  refresh,
  profileStatus,
}: {
  clientName: ClientName;
  bills: BillMonth[];
  navigate: (page: string) => void;
  globalSpend: number;
  globalSpendNote: string;
  allServerCount: number;
  servers: DisplayServer[];
  inventory?: AwsProfileInventory;
  inventoryState: AwsInventoryState["state"];
  refresh: () => void;
  profileStatus?: AwsProfileStatus;
}) {
  const client = { ...clients[clientName], bills },
    latest = client.bills.at(-1)!,
    prior = client.bills.at(-2)!;
  const change = ((latest.total - prior.total) / prior.total) * 100,
    maxBill = Math.max(...client.bills.map((bill) => bill.total));
  const stopped = servers.filter(
    (server) => server.liveState === "stopped",
  ).length;
  const latestBackup = latestBackupAt(inventory);
  const backupStreams =
    inventory?.s3Backups.filter(
      (item) =>
        item.client === clientName ||
        (clientName === "Nilkamal" && item.client.startsWith("Nilkamal")),
    ) ?? [];
  const healthyBackupStreams = backupStreams.filter((item) => backupIsFresh(item.type, item.metric.latest?.lastModified)).length;
  const networkVpcs = inventory?.network?.vpcs.length;
  return (
    <>
      <section className="notice">
        <span>i</span>
        <div>
          <strong>
            {inventory
              ? inventory.errors.length ? "AWS inventory synchronized with source issues" : "Live AWS inventory synchronized"
              : profileStatus?.connected
                ? "AWS profile connected"
                : "Source-backed baseline"}
          </strong>
          <p>
            {inventory
              ? `${inventory.instances.length} EC2 instances, ${inventory.buckets.length} S3 buckets, and ${inventory.s3Backups.reduce((n, b) => n + b.metric.monthCount, 0)} S3 backup objects discovered at ${formatDateTime(inventory.discoveredAt)}.${inventory.errors.length ? ` ${inventory.errors.length} collector issue${inventory.errors.length === 1 ? "" : "s"} require attention.` : ""}`
              : profileStatus?.connected
                ? `${client.profile} was verified against account ${profileStatus.accountId}; resource discovery is ${inventoryState === "loading" ? "running" : "unavailable"}.`
                : client.sourceNote}
          </p>
        </div>
        <button onClick={refresh}>Refresh inventory</button>
      </section>
      <section className="kpis" aria-label="Key metrics">
        <Kpi
          icon="dollar"
          title="Selected client spend"
          value={usd.format(latest.total)}
          note={`${formatPercent(change, true)} vs ${prior.month}`}
          tone={change > 0.05 ? "warning" : "success"}
        />
        <Kpi
          icon="servers"
          title="EC2 instances"
          value={
            inventoryState === "loading" ? "Syncing…" : String(servers.length)
          }
          note={`${allServerCount} across all clients · ${stopped} stopped`}
          tone={stopped ? "warning" : "default"}
        />
        <Kpi
          icon="check"
          title="S3 backup streams"
          value={
            inventory
              ? `${healthyBackupStreams}/${backupStreams.length || (clientName === "Nilkamal" ? 8 : 4)}`
              : "Unavailable"
          }
          note={
            latestBackup
              ? `Latest ${formatRelative(latestBackup)}`
              : inventory
                ? `${inventory.buckets.length} S3 buckets inspected`
                : "Run local AWS discovery"
          }
          tone={inventory && healthyBackupStreams < (backupStreams.length || (clientName === "Nilkamal" ? 8 : 4)) ? "warning" : latestBackup ? "success" : "muted"}
        />
        <Kpi
          icon="network"
          title="Network posture"
          value={
            networkVpcs != null
              ? `${networkVpcs} VPC${networkVpcs === 1 ? "" : "s"}`
              : "Unavailable"
          }
          note={`${client.primaryRegion} → ${client.drRegion}`}
        />
        <Kpi
          icon="sigma"
          title="All-client spend"
          value={usd.format(globalSpend)}
          note={globalSpendNote}
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel spend-panel">
          <PanelTitle
            title="Monthly spend"
            action="Billing details"
            onAction={() => navigate("Billing")}
          />
          <div className="spend-summary">
            <div>
              <strong>{usd.format(latest.total)}</strong>
              <span>{latest.month} {latest.year} grand total</span>
            </div>
            <p className={change > 0 ? "up" : "down"}>
              {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
            </p>
          </div>
          <div className="bar-chart" aria-label="Six-month billing totals">
            {client.bills.map((bill) => (
              <div className="bar-column" key={bill.month}>
                <span>{usd.format(bill.total)}</span>
                <i
                  style={{
                    height: `${Math.max(10, (bill.total / maxBill) * 100)}%`,
                  }}
                />
                <b>{bill.month}</b>
              </div>
            ))}
          </div>
          <div className="panel-foot">
            <span>
              6-month average{" "}
              <strong>
                {usd.format(average(client.bills.map((b) => b.total)))}
              </strong>
            </span>
            <span>
              Top service <strong>{latest.topService}</strong>
            </span>
          </div>
        </article>
        <article className="panel servers-panel">
          <PanelTitle
            title={`EC2 instances (${servers.length})`}
            action="View inventory"
            onAction={() => navigate("Infrastructure")}
          />
          {servers.length ? (
            <ServerTable
              servers={servers.slice(0, 6)}
              onSelect={() => navigate("Infrastructure")}
            />
          ) : (
            <Empty
              title={
                inventoryState === "loading"
                  ? "Discovering EC2 instances"
                  : "No EC2 instances returned"
              }
              text={
                inventoryState === "loading"
                  ? "The read-only connector is querying Mumbai and Hyderabad."
                  : "AWS returned no instances for this profile in the configured regions."
              }
            />
          )}
        </article>
        <article className="panel network-panel">
          <PanelTitle
            title="Regional topology"
            action="Network"
            onAction={() => navigate("Network")}
          />
          <RegionRoute clientName={clientName} />
          <p className="panel-note">
            Architecture context comes from the supplied infrastructure
            baseline. Tunnel state and live telemetry need AWS synchronization.
          </p>
        </article>
        <article className="panel backup-panel">
          <PanelTitle
            title="S3 backup summary"
            action="Backups"
            onAction={() => navigate("Backups")}
          />
          <div className="backup-visual">
            <div className="backup-ring">
              <AppIcon name="cloud" size={23} />
            </div>
            <div>
              <strong>
                {inventory
                  ? `${inventory.s3Backups.reduce((n, b) => n + b.metric.monthCount, 0)} objects this month`
                  : "Awaiting sync"}
              </strong>
              <span>
                {inventory
                  ? `${inventory.buckets.length} S3 buckets · ${healthyBackupStreams}/${backupStreams.length || (clientName === "Nilkamal" ? 8 : 4)} streams reporting`
                  : "Local discovery required"}
              </span>
              <small>
                <i />{" "}
                {latestBackup
                  ? `Latest ${formatRelative(latestBackup)}`
                  : "No live timestamp returned"}
              </small>
            </div>
          </div>
        </article>
        <article className="panel alerts-panel">
          <PanelTitle
            title="Attention needed"
            action="All alerts"
            onAction={() => navigate("Alerts")}
          />
          <AlertRows
            clientName={clientName}
            profileStatus={profileStatus}
            inventory={inventory}
            inventoryState={inventoryState}
          />
        </article>
      </section>
    </>
  );
}

function PricingPage() {
  const [instance, setInstance] = useState<Ec2Size>("t3a.2xlarge");
  const [region, setRegion] = useState<RegionCode>("ap-south-1");
  const [os, setOs] = useState<OperatingSystem>("windows");
  const [purchase, setPurchase] = useState<PurchaseOption>("onDemand");
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [quantity, setQuantity] = useState(1);
  const [hours, setHours] = useState(730);
  const [storage, setStorage] = useState(500);
  const [volumes, setVolumes] = useState(1);
  const [iops, setIops] = useState(3000);
  const [throughput, setThroughput] = useState(125);
  const sqlUnavailable = !ec2SoftwareRates(instance, region, "windowsSqlStandard");
  const purchaseOptions = availablePurchaseOptions(instance, region, os);
  useEffect(() => {
    if (sqlUnavailable && os === "windowsSqlStandard") setOs("windows");
  }, [sqlUnavailable, os]);
  useEffect(() => {
    if (region === "ap-south-2" && instance.startsWith("t3a.")) setInstance("t3.2xlarge");
  }, [instance, region]);
  useEffect(() => {
    if (!purchaseOptions.includes(purchase)) setPurchase("onDemand");
  }, [purchase, purchaseOptions]);
  const [albCount, setAlbCount] = useState(1);
  const [lcus, setLcus] = useState(10);
  const [s3Storage, setS3Storage] = useState(100);
  const [s3Class, setS3Class] = useState<"standard" | "standardIa">("standard");
  const [vpnConnections, setVpnConnections] = useState(1);
  const [publicIps, setPublicIps] = useState(1);
  const [wafAcls, setWafAcls] = useState(1);
  const [wafRules, setWafRules] = useState(10);
  const [wafRequests, setWafRequests] = useState(1);
  const [routeZones, setRouteZones] = useState(1);
  const [routeQueries, setRouteQueries] = useState(1);
  const [secrets, setSecrets] = useState(5);
  const [secretApiRequests, setSecretApiRequests] = useState(10000);
  const [snapshotStorage, setSnapshotStorage] = useState(100);
  const [adDirectories, setAdDirectories] = useState(1);
  const [adControllers, setAdControllers] = useState(2);
  const [fsxStorage, setFsxStorage] = useState(500);
  const [fsxThroughput, setFsxThroughput] = useState(128);
  const [fsxBackupStorage, setFsxBackupStorage] = useState(100);
  const [intraRegionGb, setIntraRegionGb] = useState(100);
  const [internetOutGb, setInternetOutGb] = useState(100);
  const [crossRegionGb, setCrossRegionGb] = useState(100);
  const [cloudwatchMetrics, setCloudwatchMetrics] = useState(20);
  const [cloudwatchAlarms, setCloudwatchAlarms] = useState(10);
  const [cloudwatchIngestGb, setCloudwatchIngestGb] = useState(10);
  const [cloudwatchStorageGb, setCloudwatchStorageGb] = useState(10);
  const [cloudtrailEvents, setCloudtrailEvents] = useState(1);
  const [snsMessages, setSnsMessages] = useState(1);
  const [configItems, setConfigItems] = useState(1000);
  const selected = EC2_CATALOG.find((item) => item.name === instance)!;
  const compute = calculateEc2Quote({ instance, region, os, purchase, quantity, hours });
  const ebs = calculateGp3(storage, volumes, iops, throughput, region);
  const total = (compute?.computeMonthly ?? 0) + ebs.total;
  const b = PRICING_SNAPSHOT.benchmarks;
  const s3Rate =
    s3Class === "standard"
      ? PRICING_SNAPSHOT.regions[region].s3StandardGb
      : PRICING_SNAPSHOT.regions[region].s3StandardIaGb;
  const benchmarkCosts = {
    alb: albCount * hours * (b.albHourly + lcus * b.lcuHourly),
    s3: s3Storage * s3Rate,
    vpn: vpnConnections * hours * b.vpnHourly,
    ipv4: publicIps * hours * b.publicIpv4Hourly,
    waf:
      wafAcls * b.wafAcl +
      wafRules * b.wafRule +
      wafRequests * b.wafRequestsMillion,
    route53:
      routeZones * b.route53Zone + routeQueries * b.route53QueriesMillion,
    secrets: secrets * b.secret + (secretApiRequests / 10_000) * b.secretApiTenThousand,
    snapshot: snapshotStorage * PRICING_SNAPSHOT.regions[region].ebsSnapshotGb,
    ad: adDirectories * hours * (b.managedAdDirectoryHour + Math.max(0, adControllers - 2) * b.additionalAdControllerHour),
    fsx: fsxStorage * b.fsxSsdMultiAzGb + fsxThroughput * b.fsxThroughputMb + fsxBackupStorage * b.fsxBackupGb,
    transfer:
      intraRegionGb * b.interAzGb +
      crossRegionGb * b.crossRegionGb +
      internetOutGb * b.internetOutGb,
    cloudwatch:
      cloudwatchMetrics * b.cloudwatchMetric +
      cloudwatchAlarms * b.cloudwatchAlarm +
      cloudwatchIngestGb * b.cloudwatchLogIngestGb +
      cloudwatchStorageGb * b.cloudwatchLogStorageGb,
    cloudtrail: cloudtrailEvents * 10 * b.cloudtrailDataEventHundredThousand,
    sns: snsMessages * b.snsMillion,
    config: configItems * b.configItem,
  };
  const money = (value: number) => currency === "USD" ? usd.format(value) : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value * PRICING_SNAPSHOT.fx.usdToInr);
  const field = (
    label: string,
    value: string | number,
    set: (value: string) => void,
    type: "text" | "number" = "text",
  ) => (
    <label className="pricing-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );
  return (
    <div className="page-stack pricing-page">
      <section className="pricing-hero">
        <div>
          <p className="eyebrow">FAST INFRASTRUCTURE ESTIMATE</p>
          <h2>AWS Pricing Calculator</h2>
          <p>
            Curated Stratus benchmarks for the configurations we quote most
            often.
          </p>
        </div>
        <span className="pricing-stamp">
          AWS pricing snapshot: {PRICING_SNAPSHOT_DATE}
        </span>
      </section>
      <section className="pricing-layout">
        <article className="panel pricing-form">
          <PanelTitle title="EC2 configuration" />
          <div className="pricing-form-grid">
            <label className="pricing-field full">
              <span>Instance</span>
              <select
                value={instance}
                onChange={(e) => setInstance(e.target.value as Ec2Size)}
              >
                {EC2_CATALOG.filter((item) => region === "ap-south-1" || !item.name.startsWith("t3a.")).map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} — {item.vcpu} vCPU · {item.memoryGb} GB RAM
                  </option>
                ))}
              </select>
              <small>
                {selected.vcpu} vCPU · {selected.memoryGb} GB RAM
              </small>
            </label>
            <label className="pricing-field">
              <span>Region</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as RegionCode)}
              >
                <option value="ap-south-1">Mumbai (ap-south-1)</option>
                <option value="ap-south-2">Hyderabad (ap-south-2)</option>
              </select>
            </label>
            <label className="pricing-field">
              <span>Operating system</span>
              <select
                value={os}
                onChange={(e) => setOs(e.target.value as OperatingSystem)}
              >
                <option value="windows">Windows Server</option>
                <option value="windowsSqlStandard" disabled={sqlUnavailable}>
                  Windows + SQL Server Standard
                  {sqlUnavailable ? " (not offered)" : ""}
                </option>
              </select>
            </label>
            <label className="pricing-field">
              <span>Purchase option</span>
              <select
                value={purchase}
                onChange={(e) => setPurchase(e.target.value as PurchaseOption)}
              >
                {purchaseOptions.map((option) => <option value={option} key={option}>{purchaseLabel(option)}</option>)}
              </select>
              <small>
                Monthly equivalent is calculated locally from the static annual
                commitment snapshot.
              </small>
            </label>
            <label className="pricing-field">
              <span>Display currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value as "USD" | "INR")}>
                <option value="USD">USD — authoritative</option>
                <option value="INR">INR — converted estimate</option>
              </select>
              <small>Stored FX: 1 USD = ₹{PRICING_SNAPSHOT.fx.usdToInr}</small>
            </label>
            {field(
              "Quantity",
              quantity,
              (v) => setQuantity(Math.max(1, Number(v) || 1)),
              "number",
            )}
            {field(
              "Hours / month",
              hours,
              (v) => setHours(Math.max(1, Number(v) || 1)),
              "number",
            )}
          </div>
          <details className="pricing-advanced">
            <summary>EBS gp3 · Advanced settings</summary>
            <div className="pricing-form-grid">
              {field(
                "Volume size (GB)",
                storage,
                (v) => setStorage(Math.max(1, Number(v) || 1)),
                "number",
              )}
              {field(
                "Number of volumes",
                volumes,
                (v) => setVolumes(Math.max(1, Number(v) || 1)),
                "number",
              )}
              {field(
                "IOPS",
                iops,
                (v) => setIops(Math.max(3000, Number(v) || 3000)),
                "number",
              )}
              {field(
                "Throughput (MiB/s)",
                throughput,
                (v) => setThroughput(Math.max(125, Number(v) || 125)),
                "number",
              )}
            </div>
            <small>
              gp3 includes 3,000 IOPS and 125 MiB/s. Only usage above those
              baselines is charged.
            </small>
          </details>
        </article>
        <aside className="panel pricing-result">
          <p className="eyebrow">ESTIMATED MONTHLY COST</p>
          <strong>{money(total)}</strong>
          <div className="pricing-result-line">
            <span>
              Compute · {quantity} × {hours}h
            </span>
            <b>{money(compute?.computeMonthly ?? 0)}</b>
          </div>
          <div className="pricing-result-line">
            <span>
              EBS · gp3 {storage} GB × {volumes}
            </span>
            <b>{money(ebs.storage)}</b>
          </div>
          {ebs.additionalIops > 0 && <div className="pricing-result-line"><span>Additional gp3 IOPS</span><b>{money(ebs.additionalIops)}</b></div>}
          {ebs.additionalThroughput > 0 && <div className="pricing-result-line"><span>Additional gp3 throughput</span><b>{money(ebs.additionalThroughput)}</b></div>}
          {purchase !== "onDemand" && (
            <>
              <div className="pricing-result-line"><span>On-Demand equivalent</span><b>{money(compute?.onDemandMonthly ?? 0)}</b></div>
              <div className="pricing-result-line"><span>Effective hourly rate</span><b>{money(compute?.effectiveHourly ?? 0)}/hr</b></div>
              <div className="pricing-result-line">
                <span>Recurring plan charge</span>
                <b>{money(compute?.recurringMonthly ?? 0)}/mo</b>
              </div>
              <div className="pricing-result-line upfront">
                <span>Upfront commitment</span>
                <b>{money(compute?.upfront ?? 0)}</b>
              </div>
              <div className="pricing-result-line"><span>Total 1-year commitment</span><b>{money(compute?.totalCommitment ?? 0)}</b></div>
              <div className="pricing-result-line"><span>Estimated annual savings</span><b>{money(compute?.savings ?? 0)} · {(compute?.savingsPercent ?? 0).toFixed(1)}%</b></div>
            </>
          )}
          <div className="pricing-assumptions">
            <p>Pricing: AWS snapshot {PRICING_SNAPSHOT_DATE}</p>
            <p>Region: {PRICING_SNAPSHOT.regions[region].label}</p>
            <p>Currency: {currency}{currency === "INR" ? ` · converted at ₹${PRICING_SNAPSHOT.fx.usdToInr}/USD` : " · AWS source currency"}</p>
            <p>
              Monthly equivalent includes the selected annual commitment terms.
            </p>
          </div>
        </aside>
      </section>
      <section className="panel benchmark-panel">
        <PanelTitle title="Benchmark service estimates" />
        <p className="panel-note">
          Fast local estimates using standard Stratus workload assumptions. No
          AWS pricing request is made.
        </p>
        <div className="benchmark-grid">
          <div className="benchmark-card">
            <b>Application Load Balancer</b>
            {field(
              "ALBs",
              albCount,
              (v) => setAlbCount(Math.max(1, Number(v) || 1)),
              "number",
            )}
            {field(
              "LCUs / hour",
              lcus,
              (v) => setLcus(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.alb)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>S3</b>
            <label className="pricing-field">
              <span>Storage class</span>
              <select
                value={s3Class}
                onChange={(e) =>
                  setS3Class(e.target.value as "standard" | "standardIa")
                }
              >
                <option value="standard">Standard</option>
                <option value="standardIa">Standard-IA</option>
              </select>
            </label>
            {field(
              "Storage (GB)",
              s3Storage,
              (v) => setS3Storage(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.s3)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>AMI / EBS snapshots</b>
            {field(
              "Snapshot storage (GB-month)",
              snapshotStorage,
              (v) => setSnapshotStorage(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>{money(benchmarkCosts.snapshot)}<small>/ month</small></strong>
          </div>
          <div className="benchmark-card">
            <b>Data transfer</b>
            {field(
              "Intra-region (GB)",
              intraRegionGb,
              (v) => setIntraRegionGb(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Internet outbound (GB)",
              internetOutGb,
              (v) => setInternetOutGb(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Other regions outbound (GB)",
              crossRegionGb,
              (v) => setCrossRegionGb(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <small>Bandwidth is capacity; AWS transfer charges here are calculated from GB moved.</small>
            <strong>
              {money(benchmarkCosts.transfer)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>Site-to-Site VPN</b>
            {field(
              "Connections",
              vpnConnections,
              (v) => setVpnConnections(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.vpn)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>Public IPv4</b>
            {field(
              "Addresses",
              publicIps,
              (v) => setPublicIps(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.ipv4)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>WAF</b>
            {field(
              "Web ACLs",
              wafAcls,
              (v) => setWafAcls(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Rules",
              wafRules,
              (v) => setWafRules(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Requests (M)",
              wafRequests,
              (v) => setWafRequests(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.waf)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>CloudWatch</b>
            {field(
              "Metrics",
              cloudwatchMetrics,
              (v) => setCloudwatchMetrics(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Alarms",
              cloudwatchAlarms,
              (v) => setCloudwatchAlarms(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Log ingest (GB)",
              cloudwatchIngestGb,
              (v) => setCloudwatchIngestGb(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Log storage (GB)",
              cloudwatchStorageGb,
              (v) => setCloudwatchStorageGb(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.cloudwatch)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>CloudTrail</b>
            {field(
              "Data events (M)",
              cloudtrailEvents,
              (v) => setCloudtrailEvents(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.cloudtrail)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>SNS</b>
            {field(
              "Messages / requests (M)",
              snsMessages,
              (v) => setSnsMessages(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.sns)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>AWS Config</b>
            {field(
              "Configuration items",
              configItems,
              (v) => setConfigItems(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.config)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>Route 53</b>
            {field(
              "Hosted zones",
              routeZones,
              (v) => setRouteZones(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Queries (M)",
              routeQueries,
              (v) => setRouteQueries(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.route53)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>Secrets Manager</b>
            {field(
              "Secrets",
              secrets,
              (v) => setSecrets(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "API calls / month",
              secretApiRequests,
              (v) => setSecretApiRequests(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.secrets)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>Managed Microsoft AD</b>
            {field(
              "Directories",
              adDirectories,
              (v) => setAdDirectories(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Domain controllers",
              adControllers,
              (v) => setAdControllers(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.ad)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card">
            <b>FSx Windows Multi-AZ</b>
            {field(
              "SSD storage (GB)",
              fsxStorage,
              (v) => setFsxStorage(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Throughput (MB/s)",
              fsxThroughput,
              (v) => setFsxThroughput(Math.max(0, Number(v) || 0)),
              "number",
            )}
            {field(
              "Backup storage (GB)",
              fsxBackupStorage,
              (v) => setFsxBackupStorage(Math.max(0, Number(v) || 0)),
              "number",
            )}
            <strong>
              {money(benchmarkCosts.fsx)}
              <small>/ month</small>
            </strong>
          </div>
          <div className="benchmark-card benchmark-free">
            <b>EC2 Auto Scaling</b>
            <p>Direct AWS service charge: $0. EC2 instances and related resources remain billable.</p>
            <strong>{money(b.autoScalingDirect)}<small>/ month direct</small></strong>
          </div>
          <div className="benchmark-card benchmark-free">
            <b>AWS Systems Manager</b>
            <p>Core Systems Manager service features have no additional direct charge; advanced features can be billable.</p>
            <strong>{money(b.systemsManagerDirect)}<small>/ month direct</small></strong>
          </div>
        </div>
      </section>
    </div>
  );
}

function BillingPage({
  clientName,
  bills,
  onUpload,
}: {
  clientName: ClientName;
  bills: BillMonth[];
  onUpload: () => void;
}) {
  const client = { ...clients[clientName], bills },
    latest = client.bills.at(-1)!,
    prior = client.bills.at(-2)!;
  const high = client.bills.reduce((a, b) => (a.total > b.total ? a : b)),
    low = client.bills.reduce((a, b) => (a.total < b.total ? a : b)),
    change = ((latest.total - prior.total) / prior.total) * 100;
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">
            {client.bills.at(0)!.month.toUpperCase()} — {latest.month.toUpperCase()} {latest.year}
          </p>
          <h2>Billing analysis</h2>
          <p>
            Validated AWS bill summaries. Uploaded periods replace matching
            account months and persist across restarts.
          </p>
        </div>
        <button className="refresh-button" onClick={onUpload}>
          <AppIcon name="upload" size={15} /> Upload bill
        </button>
      </section>
      <section className="summary-grid">
        <Kpi
          icon="dollar"
          title="Latest total"
          value={usd.format(latest.total)}
          note={`${latest.month} ${latest.year} grand total`}
        />
        <Kpi
          icon="billing"
          title="Pre-tax"
          value={usd.format(latest.preTax)}
          note={`Tax ${usd.format(latest.total - latest.preTax)}`}
        />
        <Kpi
          icon="arrow"
          title="Month over month"
          value={formatPercent(change, true)}
          note={`${prior.month} ${prior.year} · ${usd.format(prior.total)}`}
          tone={change > 0 ? "warning" : "success"}
        />
        <Kpi
          icon="sigma"
          title="Six-month average"
          value={usd.format(average(client.bills.map((b) => b.total)))}
          note={`High ${high.month} · Low ${low.month}`}
        />
      </section>
      <section className="page-grid">
        <article className="panel wide">
          <PanelTitle title="Monthly totals" />
          <div className="billing-bars">
            {client.bills.map((bill) => (
              <div key={bill.month}>
                <span>
                  <b>{bill.month} {bill.year}</b>
                  <small>{usd.format(bill.total)}</small>
                </span>
                <i>
                  <b style={{ width: `${(bill.total / high.total) * 100}%` }} />
                </i>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <PanelTitle title="Previous-month composition" />
          <div className="donut-wrap">
            <div
              className="donut"
              style={
                {
                  "--share": `${(prior.topServiceCost / prior.total) * 100}%`,
                } as React.CSSProperties
              }
            >
              <strong>
                {((prior.topServiceCost / prior.total) * 100).toFixed(0)}%
              </strong>
              <small>EC2</small>
            </div>
            <div className="legend">
              <p>
                <i className="ec2" />
                Elastic Compute Cloud <b>{usd.format(prior.topServiceCost)}</b>
              </p>
              <p>
                <i />
                Other services & tax{" "}
                <b>{usd.format(prior.total - prior.topServiceCost)}</b>
              </p>
            </div>
          </div>
        </article>
        <article className="panel wide">
          <PanelTitle title="Available service composition" />
          <div className="data-list">
            <div>
              <span>
                Elastic Compute Cloud
                <small>Largest supported service line</small>
              </span>
              <b>
                {usd.format(latest.topServiceCost)}
                <small>
                  {((latest.topServiceCost / latest.total) * 100).toFixed(1)}%
                  of {latest.month}
                </small>
              </b>
            </div>
            <div>
              <span>
                Other services and tax
                <small>
                  Derived remainder. The normalized bill summary does not retain
                  individual non-leading service lines.
                </small>
              </span>
              <b>
                {usd.format(latest.total - latest.topServiceCost)}
                <small>
                  {(100 - (latest.topServiceCost / latest.total) * 100).toFixed(
                    1,
                  )}
                  % of {latest.month}
                </small>
              </b>
            </div>
          </div>
        </article>
        <article className="panel">
          <PanelTitle title="Cost investigation" />
          <div className="insights">
            <p className={change > 10 ? "warn" : "ok"}>
              <span>{change > 0 ? "↑" : "↓"}</span>
              <b>
                {Math.abs(change).toFixed(1)}%{" "}
                {change > 0 ? "increase" : "decrease"}
                <small>{latest.month} compared with {prior.month}</small>
              </b>
            </p>
            <p>
              <span>◎</span>
              <b>
                {high.month} was highest
                <small>{usd.format(high.total)} grand total</small>
              </b>
            </p>
            <p>
              <span>⌖</span>
              <b>
                {latest.topRegion} led regional charges
                <small>{usd.format(latest.topRegionCost)} gross regional line{latest.topRegionCost > latest.preTax ? " · before account-level credits" : ""}</small>
              </b>
            </p>
            <p>
              <span>◌</span>
              <b>
                {low.month} was lowest
                <small>{usd.format(low.total)} grand total</small>
              </b>
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

function ServersPage({
  liveServers,
  inventoryState,
  regionFilter,
  setRegionFilter,
  selectedServer,
  setSelectedServer,
}: {
  liveServers: DisplayServer[];
  inventoryState: AwsInventoryState["state"];
  regionFilter: string;
  setRegionFilter: (value: string) => void;
  selectedServer: DisplayServer | null;
  setSelectedServer: (server: DisplayServer | null) => void;
}) {
  const [serverSearch, setServerSearch] = useState("");
  const [environmentFilter, setEnvironmentFilter] =
    useState("All environments");
  const [stateFilter, setStateFilter] = useState("All states");
  const servers = liveServers.filter((server) => {
    const matchesRegion =
      regionFilter === "All regions" || server.region === regionFilter;
    const matchesEnvironment =
      environmentFilter === "All environments" ||
      server.environment
        .toLowerCase()
        .includes(environmentFilter.toLowerCase());
    const matchesState =
      stateFilter === "All states" ||
      (server.liveState ?? "documented").toLowerCase() ===
        stateFilter.toLowerCase();
    const haystack =
      `${server.name} ${server.instanceId ?? ""} ${server.instanceType ?? ""} ${server.role} ${server.environment} ${server.os} ${server.region} ${server.zone} ${server.privateIp ?? ""} ${server.publicIp ?? ""} ${server.vpcId ?? ""} ${server.subnetId ?? ""} ${server.storage}`.toLowerCase();
    return (
      matchesRegion &&
      matchesEnvironment &&
      matchesState &&
      haystack.includes(serverSearch.trim().toLowerCase())
    );
  });
  if (selectedServer)
    return (
      <div className="page-stack">
        <button className="back-link" onClick={() => setSelectedServer(null)}>
          <AppIcon name="arrow" size={14} /> Back to servers
        </button>
        <section className="page-head">
          <div>
            <p className="eyebrow">
              {selectedServer.source === "live"
                ? "LIVE EC2 RESOURCE"
                : "DOCUMENTED RESOURCE"}
            </p>
            <h2>{selectedServer.name}</h2>
            <p>
              {selectedServer.instanceId ?? selectedServer.role} ·{" "}
              {selectedServer.liveState ?? selectedServer.environment}
            </p>
          </div>
          <span
            className={`source-badge ${selectedServer.liveState === "stopped" ? "warning" : ""}`}
          >
            {selectedServer.source === "live"
              ? `AWS · ${selectedServer.liveState}`
              : "Document baseline"}
          </span>
        </section>
        <section className="detail-grid">
          <Detail
            title="Identity"
            rows={[
              ["AWS instance ID", selectedServer.instanceId ?? "Unavailable"],
              ["State", selectedServer.liveState ?? "Documented"],
              ["Environment", selectedServer.environment],
              ["Launch time", formatDateTime(selectedServer.launchedAt)],
            ]}
          />
          <Detail
            title="Compute"
            rows={[
              ["Operating system", selectedServer.os],
              ["CPU", selectedServer.cpu],
              ["Memory", selectedServer.memory],
              ["Instance type", selectedServer.instanceType ?? "Unavailable"],
            ]}
          />
          <Detail
            title="Networking"
            rows={[
              ["Region", selectedServer.region],
              ["Availability zone", selectedServer.zone],
              [
                "Private / public IP",
                `${selectedServer.privateIp ?? "Unavailable"} / ${selectedServer.publicIp ?? "Unavailable"}`,
              ],
              [
                "VPC / subnet",
                `${selectedServer.vpcId ?? "Unavailable"} / ${selectedServer.subnetId ?? "Unavailable"}`,
              ],
              [
                "Security groups",
                selectedServer.securityGroups
                  ?.map((group) => `${group.name} (${group.id})`)
                  .join(", ") || "Unavailable",
              ],
            ]}
          />
          <Detail
            title="EBS storage"
            rows={
              selectedServer.volumes?.length
                ? selectedServer.volumes.flatMap((volume, index) => [
                    [
                      `Volume ${index + 1}`,
                      `${volume.volumeId} · ${volume.sizeGiB ?? "?"} GB ${volume.type ?? "EBS"}`,
                    ],
                    [
                      index === 0 ? "Encryption" : `Encryption ${index + 1}`,
                      volume.encrypted ? "Encrypted" : "Not encrypted",
                    ],
                  ])
                : [
                    ["Storage", selectedServer.storage],
                    ["Volumes", "No attached EBS volume returned"],
                  ]
            }
          />
        </section>
      </div>
    );
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">LIVE INFRASTRUCTURE INVENTORY</p>
          <h2>EC2 instances</h2>
          <p>
            Read directly from EC2 and EBS in Mumbai and Hyderabad. State,
            addressing, instance type, and volumes reflect the latest discovery.
          </p>
        </div>
        <div className="inventory-filters">
          <label>
            <AppIcon name="search" size={14} />
            <span className="sr-only">Search server inventory</span>
            <input
              value={serverSearch}
              onChange={(event) => setServerSearch(event.target.value)}
              placeholder="Search inventory"
            />
          </label>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            aria-label="Filter servers by region"
          >
            <option>All regions</option>
            <option>Mumbai</option>
            <option>Hyderabad</option>
          </select>
          <select
            value={environmentFilter}
            onChange={(event) => setEnvironmentFilter(event.target.value)}
            aria-label="Filter servers by environment"
          >
            <option>All environments</option>
            <option>Production</option>
            <option>Stage</option>
          </select>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            aria-label="Filter servers by state"
          >
            <option>All states</option>
            <option>running</option>
            <option>stopped</option>
            <option>documented</option>
          </select>
        </div>
      </section>
      <article className="panel inventory-panel">
        <PanelTitle
          title={
            inventoryState === "loading"
              ? "Discovering EC2 resources…"
              : `${servers.length} EC2 resources`
          }
        />
        {servers.length ? (
          <ServerTable
            servers={servers}
            onSelect={setSelectedServer}
            detailed
          />
        ) : (
          <Empty
            title={
              inventoryState === "loading"
                ? "Querying EC2"
                : "No matching instances"
            }
            text={
              inventoryState === "loading"
                ? "The local connector is reading both configured regions."
                : liveServers.length
                  ? "Adjust the search or filters to see live resources."
                  : "AWS returned no EC2 instances for this profile in Mumbai or Hyderabad."
            }
          />
        )}
      </article>
    </div>
  );
}

function BackupsPage({
  clientName,
  inventory,
  inventoryState,
}: {
  clientName: ClientName;
  inventory?: AwsProfileInventory;
  inventoryState: AwsInventoryState["state"];
}) {
  const workloads =
    clientName === "Nilkamal"
      ? ["Nilkamal OMS", "Nilkamal MWMS"]
      : [clientName];
  const [client, setClient] = useState(workloads[0]!);
  useEffect(() => {
    setClient(workloads[0]!);
  }, [clientName]);
  const summaries =
    inventory?.s3Backups.filter((item) => item.client === client) ?? [];
  const metric = (type: string) =>
    summaries.find((item) => item.type === type)?.metric;
  const s3Error = inventory?.errors.some((error) => error.service.startsWith("S3"));
  const card = (type: string, label: string, expectation: string) => {
    const m = metric(type),
      ageHours = m?.latest
        ? (Date.now() - new Date(m.latest.lastModified).getTime()) / 3_600_000
        : Infinity;
    const threshold =
      type === "ami"
        ? 24 * 45
        : type === "full"
          ? 30
          : type === "differential"
            ? 5
            : 19 / 60;
    const stale = Boolean(m?.latest) && ageHours > threshold;
    return (
      <article
        className={`backup-card ${!m?.latest || stale ? "needs-attention" : "healthy"}`}
      >
        <header>
          <div>
            <span className="backup-type-icon">
              <AppIcon
                name={
                  type === "ami"
                    ? "servers"
                    : type === "transactional"
                      ? "clock"
                      : type === "differential"
                        ? "route"
                        : "cloud"
                }
                size={18}
              />
            </span>
            <div>
              <p>{type === "ami" ? "Application" : "Database"}</p>
              <h4>{label}</h4>
            </div>
          </div>
          <span
            className={`health-pill ${!m?.latest || stale ? "warning" : "good"}`}
          >
            {!m?.latest ? "No backup" : stale ? "Overdue" : "Healthy"}
          </span>
        </header>
        {m?.latest ? (
          <>
            <div className="latest-backup">
              <span>Latest successful backup</span>
              <strong>{formatDateTime(m.latest.lastModified)}</strong>
              <p title={m.latest.key}>{shortKey(m.latest.key)}</p>
              <b>{formatBytes(m.latest.sizeBytes)}</b>
            </div>
            {type !== "ami" && (
              <div className="backup-metrics">
                <div>
                  <span>Today</span>
                  <strong>{m.todayCount}</strong>
                  <small>{formatBytes(m.todayBytes)}</small>
                </div>
                <div>
                  <span>This month</span>
                  <strong>{m.monthCount}</strong>
                  <small>{formatBytes(m.monthBytes)}</small>
                </div>
                <div>
                  <span>Average backup</span>
                  <strong>{formatBytes(m.averageBackupBytes)}</strong>
                  <small>per object</small>
                </div>
                <div>
                  <span>Daily average</span>
                  <strong>{formatBytes(m.averageDailyBytes)}</strong>
                  <small>active days</small>
                </div>
              </div>
            )}
            {stale && (
              <div className="backup-warning">
                <AppIcon name="alert" size={15} />
                <span>
                  Latest backup is older than expected ({expectation}).
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="backup-empty">
            <span>
              <AppIcon name="cloud" size={22} />
            </span>
            <strong>
              {inventoryState === "loading"
                ? "Scanning S3 metadata…"
                : "No matching backup found"}
            </strong>
            <p>
              {s3Error
                ? "S3 access failed for this client. Check profile permissions and refresh."
                : `Expected ${expectation}. No record has been invented.`}
            </p>
          </div>
        )}
      </article>
    );
  };
  return (
    <div className="page-stack backup-page">
      <section className="backup-hero">
        <div>
          <p className="eyebrow">S3 BACKUP CONTROL</p>
          <h2>{client}</h2>
          <p>
            Current protection status, volume, and cadence from object metadata
            only.
          </p>
        </div>
        <div className="backup-hero-actions">
          {workloads.length > 1 && (
            <div
              className="workload-switch"
              role="group"
              aria-label="Nilkamal workload"
            >
              {workloads.map((name) => (
                <button
                  key={name}
                  className={client === name ? "active" : ""}
                  onClick={() => setClient(name)}
                  aria-pressed={client === name}
                >
                  {name.replace("Nilkamal ", "")}
                </button>
              ))}
            </div>
          )}
          <span
            className={`source-badge ${s3Error || !inventory ? "warning" : ""}`}
          >
            {inventoryState === "loading"
              ? "Refreshing metadata…"
              : s3Error
                ? "S3 access issue"
                : inventory
                  ? `Updated ${formatRelative(inventory.discoveredAt)}`
                  : "Inventory unavailable"}
          </span>
        </div>
      </section>
      <section className="backup-section">
        <div className="backup-section-title">
          <span>
            <AppIcon name="servers" size={18} />
          </span>
          <div>
            <h3>AMI / Application backup</h3>
            <p>Latest retained monthly image</p>
          </div>
        </div>
        <div className="backup-grid single">
          {card("ami", "AMI / Application", "one retained monthly image")}
        </div>
      </section>
      <section className="backup-section">
        <div className="backup-section-title">
          <span>
            <AppIcon name="billing" size={18} />
          </span>
          <div>
            <h3>Database backups</h3>
            <p>Each backup stream is measured independently</p>
          </div>
        </div>
        <div className="backup-grid">
          {card("full", "Full / Daily", "a full backup within 30 hours")}
          {card(
            "differential",
            "Differential",
            "a differential backup within 5 hours",
          )}
          {card(
            "transactional",
            "Transactional / Log",
            "a transaction log within 19 minutes",
          )}
        </div>
      </section>
    </div>
  );
}

function NetworkPage({
  clientName,
  servers,
  inventory,
  inventoryState,
}: {
  clientName: ClientName;
  servers: DisplayServer[];
  inventory?: AwsProfileInventory;
  inventoryState: AwsInventoryState["state"];
}) {
  const network = inventory?.network;
  const networkError = inventory?.errors.find((error) => error.service === "NETWORK");
  const tunnelCount = network?.vpns.reduce((sum, vpn) => sum + vpn.tunnels.length, 0) ?? 0;
  const upTunnels = network?.vpns.reduce((sum, vpn) => sum + vpn.tunnels.filter((tunnel) => tunnel.status === "UP").length, 0) ?? 0;
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">MUMBAI + HYDERABAD</p>
          <h2>Network overview</h2>
          <p>
            Live VPC, subnet, VPN tunnel, Elastic IP, gateway, and security-group
            inventory from the read-only AWS connector.
          </p>
        </div>
        <span className={`source-badge ${networkError || !network ? "warning" : ""}`}>
          {inventoryState === "loading" ? "Discovering network…" : networkError ? `${networkError.region} · ${networkError.code}` : network ? `Updated ${formatRelative(inventory!.discoveredAt)}` : "Network inventory unavailable"}
        </span>
      </section>
      <section className="summary-grid" aria-label={`${clientName} network summary`}>
        <Kpi icon="network" title="VPCs" value={network ? String(network.vpcs.length) : "Unavailable"} note={`${network?.subnets.length ?? 0} subnets across Mumbai and Hyderabad`} tone={network ? "default" : "muted"} />
        <Kpi icon="route" title="VPN tunnels" value={network ? `${upTunnels}/${tunnelCount} up` : "Unavailable"} note={`${network?.vpns.length ?? 0} site-to-site connections`} tone={network && tunnelCount && upTunnels < tunnelCount ? "warning" : network ? "success" : "muted"} />
        <Kpi icon="map" title="Elastic IPs" value={network ? String(network.addresses.length) : "Unavailable"} note={`${network?.addresses.filter((address) => address.associationId).length ?? 0} associated`} tone={network ? "default" : "muted"} />
        <Kpi icon="shield" title="Security groups" value={network ? String(network.securityGroups.length) : "Unavailable"} note={`${network?.gateways.length ?? 0} internet and NAT gateways`} tone={network ? "default" : "muted"} />
      </section>
      <article className="panel topology-panel">
        <PanelTitle title="Mumbai ↔ Hyderabad operating path" />
        <RegionRoute clientName={clientName} />
      </article>
      <section className="detail-grid">
        <Detail
          title="VPC & subnet inventory"
          rows={
            network?.vpcs.length
              ? network.vpcs.flatMap((vpc) => [
                  [`${vpc.vpcId} · ${regionName(vpc.region)}`, `${vpc.cidr ?? "CIDR unavailable"} · ${vpc.state}${vpc.isDefault ? " · default" : ""}`],
                  ...network.subnets.filter((subnet) => subnet.vpcId === vpc.vpcId).map((subnet) => [`↳ ${subnet.subnetId}`, `${subnet.cidr ?? "CIDR unavailable"} · ${subnet.availabilityZone ?? regionName(subnet.region)} · ${subnet.availableIpCount ?? "?"} IPs available`]),
                ])
              : [["VPCs", "No VPC inventory returned"]]
          }
        />
        <Detail
          title="VPN tunnel status"
          rows={
            network?.vpns.length
              ? network.vpns.flatMap((vpn) => vpn.tunnels.length ? vpn.tunnels.map((tunnel, index) => [`${vpn.vpnConnectionId} · tunnel ${index + 1}`, `${tunnel.status} · ${tunnel.outsideIp ?? "outside IP unavailable"}${tunnel.lastChangedAt ? ` · ${formatRelative(tunnel.lastChangedAt)}` : ""}`]) : [[vpn.vpnConnectionId, `${vpn.state} · no tunnel telemetry returned`]])
              : [["VPNs", "No site-to-site VPN connections returned"]]
          }
        />
        <Detail title="Elastic IP & gateway inventory" rows={network ? [
          ...network.addresses.map((address) => [address.publicIp ?? address.allocationId ?? "Elastic IP", `${address.instanceId ?? address.networkInterfaceId ?? "Unassociated"} · ${regionName(address.region)}`]),
          ...network.gateways.map((gateway) => [gateway.gatewayId, `${gateway.type === "nat" ? "NAT gateway" : "Internet gateway"} · ${gateway.state} · ${gateway.vpcId ?? "No VPC"}`]),
          ...(!network.addresses.length && !network.gateways.length ? [["Addresses & gateways", "No resources returned"]] : []),
        ] : [["Addresses & gateways", "Network inventory unavailable"]]} />
        <Detail title="EC2 addressing" rows={servers.length ? servers.flatMap((server) => [[`${server.name} · private`, server.privateIp ?? "Unavailable"], [`${server.name} · public`, server.publicIp ?? "No public IP"]]) : [["Instances", "No EC2 instances returned"]]} />
      </section>
    </div>
  );
}

function SecurityPage({
  clientName,
  inventory,
  inventoryState,
}: {
  clientName: ClientName;
  inventory?: AwsProfileInventory;
  inventoryState: AwsInventoryState["state"];
}) {
  const users = inventory?.iamUsers ?? [];
  const activeKeys = users
    .flatMap((user) => user.accessKeys)
    .filter((key) => key.status === "Active").length;
  const oldActiveKeys = users.flatMap((user) => user.accessKeys).filter((key) => key.status === "Active" && key.createdAt && Date.now() - new Date(key.createdAt).getTime() > 90 * 24 * 60 * 60_000).length;
  const usersWithMfa = users.filter((user) => user.mfaDeviceCount > 0).length;
  const administrators = users.filter((user) => user.administratorAccess);
  const ready =
    inventoryState === "ready" &&
    Boolean(inventory) &&
    !inventory?.errors.some((error) => error.service === "IAM");
  return (
    <div className="page-stack security-page">
      <section className="page-head">
        <div>
          <p className="eyebrow">IAM VISIBILITY</p>
          <h2>IAM & security</h2>
          <p>
            Live IAM users, group membership, policies, access-key status, and
            MFA coverage from the read-only connector.
          </p>
        </div>
        <span className={`source-badge ${ready ? "" : "warning"}`}>
          {ready ? "Live IAM inventory" : "IAM sync unavailable"}
        </span>
      </section>
      <section className="summary-grid">
        <Kpi
          icon="shield"
          title="IAM users"
          value={ready ? users.length.toLocaleString() : "Unavailable"}
          note={
            ready ? `${clientName} account` : "Requires IAM read permissions"
          }
          tone={ready ? "default" : "muted"}
        />
        <Kpi
          icon="key"
          title="Active keys"
          value={ready ? activeKeys.toLocaleString() : "Unavailable"}
          note={ready ? `${oldActiveKeys} older than 90 days · secrets never collected` : "Secret values are never collected"}
          tone={ready && oldActiveKeys ? "warning" : ready ? "default" : "muted"}
        />
        <Kpi
          icon="check"
          title="MFA coverage"
          value={
            ready && users.length
              ? `${Math.round((usersWithMfa / users.length) * 100)}%`
              : ready
                ? "0%"
                : "Unverified"
          }
          note={
            ready
              ? `${usersWithMfa}/${users.length} users with MFA`
              : "Live verification pending"
          }
        />
        <Kpi
          icon="alert"
          title="Admin findings"
          value={ready ? administrators.length.toLocaleString() : "Unavailable"}
          note={
            ready
              ? "Confirmed policy evidence only"
              : "No privilege claims invented"
          }
          tone={
            ready && administrators.length
              ? "warning"
              : ready
                ? "default"
                : "muted"
          }
        />
      </section>
      <article className="panel">
        <PanelTitle title="IAM user findings" />
        {ready && users.length ? (
          <div className="data-list">
            {users.map((user) => (
              <div key={user.arn}>
                <span>
                  {user.userName}
                  <small>
                    {user.administratorAccess
                      ? user.administratorEvidence.join(" · ")
                      : `${user.attachedPolicies.length + user.inlinePolicies.length + user.groupPolicies.length} policies · ${user.groups.length} groups`}
                    {` · ${user.consoleAccess === true ? "console access" : user.consoleAccess === false ? "no console access" : "console access unverified"}`}
                    {` · ${user.accessKeys.filter((key) => key.status === "Active").map((key) => key.createdAt ? `${Math.floor((Date.now() - new Date(key.createdAt).getTime()) / 86_400_000)}d key` : "key age unknown").join(", ") || "no active keys"}`}
                  </small>
                </span>
                <span
                  className={`source-badge ${user.administratorAccess ? "warning" : ""}`}
                >
                  {user.administratorAccess
                    ? "Administrator"
                    : user.mfaDeviceCount
                      ? "MFA enabled"
                      : "No MFA device"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={
              inventoryState === "loading"
                ? "Inspecting IAM"
                : "No IAM users returned"
            }
            text="Stratus evaluates direct, inline, and group-derived administrator policies without collecting secret access-key values."
          />
        )}
      </article>
    </div>
  );
}

function AlertsPage({
  clientName,
  refresh,
  profileStatus,
  inventory,
  inventoryState,
}: {
  clientName: ClientName;
  refresh: () => void;
  profileStatus?: AwsProfileStatus;
  inventory?: AwsProfileInventory;
  inventoryState: AwsInventoryState["state"];
}) {
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">ACTIONABLE SIGNALS</p>
          <h2>Alerts</h2>
          <p>
            Only conditions supported by stored data are shown. No noisy or
            fabricated operational alerts.
          </p>
        </div>
        <button className="refresh-button" onClick={refresh}>
          ↻ Retry sync
        </button>
      </section>
      <article className="panel alerts-page">
        <PanelTitle title="Open alerts" />
        <AlertRows clientName={clientName} profileStatus={profileStatus} inventory={inventory} inventoryState={inventoryState} />
      </article>
    </div>
  );
}

function ReportsPage({
  exportCsv,
}: {
  exportCsv: (kind: "billing" | "infrastructure") => void;
}) {
  return (
    <div className="page-stack">
      <section className="page-head">
        <div>
          <p className="eyebrow">EXPORTS</p>
          <h2>Reports</h2>
          <p>
            Exports use the same validated billing and live AWS inventory shown
            throughout Stratus.
          </p>
        </div>
      </section>
      <section className="report-grid">
        <button onClick={() => exportCsv("billing")}>
          <span>
            <AppIcon name="billing" />
          </span>
          <div>
            <strong>Billing summary CSV</strong>
            <small>All clients · six months · exact source totals</small>
          </div>
          <b>
            <AppIcon name="download" size={14} /> Download
          </b>
        </button>
        <button onClick={() => exportCsv("infrastructure")}>
          <span>
            <AppIcon name="servers" />
          </span>
          <div>
            <strong>Infrastructure summary CSV</strong>
            <small>
              Live EC2 state, instance IDs, regions, addresses, and EBS storage
            </small>
          </div>
          <b>
            <AppIcon name="download" size={14} /> Download
          </b>
        </button>
        <button onClick={() => window.print()}>
          <span>
            <AppIcon name="printer" />
          </span>
          <div>
            <strong>Printable current view</strong>
            <small>Browser-optimized operations report</small>
          </div>
          <b>
            <AppIcon name="printer" size={14} /> Print
          </b>
        </button>
      </section>
    </div>
  );
}

function Assistant({
  question,
  answer,
  ask,
  close,
  pending,
  config,
}: {
  question: string;
  answer: string;
  ask: (question: string) => Promise<void>;
  close: () => void;
  pending: boolean;
  config: { configured: boolean; model: string } | null;
}) {
  const [draft, setDraft] = useState("");
  const suggestions = [
    "Why did Nilkamal's bill increase?",
    "Which servers are stopped?",
    "Show failed backups.",
    "Which IAM users have admin access?",
  ];
  return (
    <aside className="assistant-panel" aria-label="Stratus AI assistant">
      <header>
        <span>
          <AppIcon name="sparkles" size={18} />
        </span>
        <div>
          <strong>Stratus AI</strong>
          <small>Read-only · source aware</small>
        </div>
        <button onClick={close} aria-label="Close assistant">
          <AppIcon name="close" size={19} />
        </button>
      </header>
      <div className="assistant-scroll">
        <p className="assistant-config">
          <AppIcon name="info" size={14} />
          {config === null
            ? "Checking OpenAI configuration…"
            : config.configured
              ? `OpenAI ${config.model} · server-side key · live sources`
              : "OpenAI key not configured · built-in source checks remain active"}
        </p>
        <div className="suggestions">
          {suggestions.map((s) => (
            <button
              className="suggestion"
              key={s}
              onClick={() => void ask(s)}
              disabled={pending}
            >
              <AppIcon name="sparkles" size={13} />
              {s}
            </button>
          ))}
        </div>
        {question && (
          <div className="chat" aria-live="polite" aria-busy={pending}>
            <p>
              <b>You</b>
              {question}
            </p>
            <p>
              <b>Stratus</b>
              {answer.split("\n").map((line, index) => (
                <span key={`${index}-${line}`}>{line}</span>
              ))}
            </p>
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !pending) {
            void ask(draft);
            setDraft("");
          }
        }}
      >
        <label className="sr-only" htmlFor="ai-question">
          Ask Stratus AI
        </label>
        <input
          id="ai-question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about billing or inventory…"
          disabled={pending}
        />
        <button aria-label="Send question" disabled={pending}>
          <AppIcon name="arrow" size={17} />
        </button>
      </form>
    </aside>
  );
}

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={close} aria-label="Close dialog">
            <AppIcon name="close" size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Kpi({
  icon,
  title,
  value,
  note,
  tone = "default",
}: {
  icon: IconName;
  title: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <div className={`kpi-icon ${tone}`}>
        <AppIcon name={icon} size={18} />
      </div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span className={tone}>{note}</span>
      </div>
    </article>
  );
}
function PanelTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <header className="panel-title">
      <h2>{title}</h2>
      {action && (
        <button onClick={onAction}>
          {action} <span>→</span>
        </button>
      )}
    </header>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>
        <AppIcon name="cloud" size={21} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function RegionRoute({ clientName }: { clientName: ClientName }) {
  const client = clients[clientName];
  return (
    <div className="route">
      <div>
        <i className="region-dot primary" />
        <strong>{client.primaryRegion}</strong>
        <span>
          Primary ·{" "}
          {client.primaryRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}
        </span>
      </div>
      <b>→</b>
      <div>
        <i className="region-dot" />
        <strong>{client.drRegion}</strong>
        <span>
          DR · {client.drRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}
        </span>
      </div>
    </div>
  );
}
function ServerTable({
  servers,
  onSelect,
  detailed = false,
}: {
  servers: DisplayServer[];
  onSelect: (server: DisplayServer) => void;
  detailed?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Instance</th>
            <th>Environment</th>
            <th>Status</th>
            <th>Compute</th>
            <th>Storage</th>
            <th>Region</th>
            {detailed && <th>IP</th>}
          </tr>
        </thead>
        <tbody>
          {servers.map((server) => (
            <tr
              key={server.instanceId ?? server.name}
              onClick={() => onSelect(server)}
              tabIndex={0}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && onSelect(server)
              }
            >
              <td>
                <strong>{server.name}</strong>
                <small>{server.os}</small>
              </td>
              <td>
                {server.instanceType ?? server.role}
                <small>{server.instanceId ?? server.source}</small>
              </td>
              <td>{server.environment}</td>
              <td>
                <span
                  className={
                    server.liveState === "stopped"
                      ? "unavailable"
                      : "documented"
                  }
                >
                  <i />
                  {server.liveState ?? "Documented"}
                </span>
              </td>
              <td>
                {server.cpu}
                <small>{server.memory}</small>
              </td>
              <td>{server.storage}</td>
              <td>
                {server.region}
                <small>{server.zone}</small>
              </td>
              {detailed && (
                <td>
                  {server.privateIp ?? "Unavailable"}
                  <small>{server.publicIp ?? "No public IP"}</small>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Detail({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <article className="panel detail-card">
      <PanelTitle title={title} />
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
function AlertRows({
  clientName,
  profileStatus,
  inventory,
  inventoryState,
}: {
  clientName: ClientName;
  profileStatus?: AwsProfileStatus;
  inventory?: AwsProfileInventory;
  inventoryState?: AwsInventoryState["state"];
}) {
  const alerts: Array<{ id: string; tone: "warning" | "info"; title: string; detail: string; at: string | null }> = [];
  if (!profileStatus?.connected) alerts.push({ id: "profile", tone: "warning", title: "AWS profile unavailable", detail: `Stratus could not verify profile “${clients[clientName].profile}”. Stored data remains available.`, at: profileStatus?.checkedAt ?? null });
  else if (!inventory && inventoryState !== "loading") alerts.push({ id: "inventory", tone: "warning", title: "AWS inventory unavailable", detail: `${clientName} is connected, but no resource snapshot is available. Retry the client sync to restore live visibility.`, at: profileStatus.checkedAt ?? null });
  for (const error of inventory?.errors ?? []) alerts.push({ id: `source:${error.service}:${error.region}`, tone: "warning", title: `${error.service.replaceAll("_", " ")} discovery failed`, detail: `${error.region} · ${error.code}. Previously stored data is retained when available.`, at: inventory?.discoveredAt ?? null });
  for (const backup of inventory?.s3Backups ?? []) {
    const latest = backup.metric.latest?.lastModified ?? null;
    if (!backupIsFresh(backup.type, latest)) alerts.push({ id: `backup:${backup.client}:${backup.type}`, tone: "warning", title: `${backup.client} ${backup.type} backup ${latest ? "overdue" : "missing"}`, detail: latest ? `Last successful object was ${formatDateTime(latest)}.` : "No matching object metadata was returned for the configured S3 prefix.", at: latest });
  }
  for (const user of inventory?.iamUsers ?? []) {
    if (user.administratorAccess && user.mfaDeviceCount === 0) alerts.push({ id: `admin-mfa:${user.arn}`, tone: "warning", title: `${user.userName} has administrator access without MFA`, detail: user.administratorEvidence.join(" · "), at: inventory?.discoveredAt ?? null });
    const oldKeys = user.accessKeys.filter((key) => key.status === "Active" && key.createdAt && Date.now() - new Date(key.createdAt).getTime() > 90 * 86_400_000);
    if (oldKeys.length) alerts.push({ id: `keys:${user.arn}`, tone: "info", title: `${user.userName} has ${oldKeys.length} active key${oldKeys.length === 1 ? "" : "s"} older than 90 days`, detail: `Oldest recorded key age: ${Math.max(...oldKeys.map((key) => Math.floor((Date.now() - new Date(key.createdAt!).getTime()) / 86_400_000)))} days.`, at: inventory?.discoveredAt ?? null });
  }
  return (
    <>
      {alerts.length ? alerts.map((alert) => <div className={`alert-row ${alert.tone === "warning" ? "warning" : ""}`} key={alert.id}>
        <span><AppIcon name={alert.tone === "warning" ? "alert" : "info"} size={13} /></span>
        <div><strong>{alert.title}</strong><p>{alert.detail}</p></div>
        <time>{alert.at ? formatRelative(alert.at) : "Now"}</time>
      </div>) : <Empty title="No active alerts" text={`${clientName} has no source failures, overdue backup streams, or IAM findings under the current Stratus rules.`} />}
    </>
  );
}
function formatMemory(mebibytes: number): string {
  return mebibytes >= 1024
    ? `${Number((mebibytes / 1024).toFixed(1))} GB`
    : `${mebibytes} MiB`;
}
function formatGiB(gibibytes: number): string {
  return gibibytes >= 1024
    ? `${Number((gibibytes / 1024).toFixed(1)).toLocaleString()} TiB`
    : `${Number(gibibytes.toFixed(1)).toLocaleString()} GiB`;
}
function backupIsFresh(type: AwsProfileInventory["s3Backups"][number]["type"], latestAt?: string | null): boolean {
  if (!latestAt) return false;
  const thresholdsMinutes = { ami: 45 * 24 * 60, full: 30 * 60, differential: 5 * 60, transactional: 19 } as const;
  const ageMinutes = (Date.now() - new Date(latestAt).getTime()) / 60_000;
  return Number.isFinite(ageMinutes) && ageMinutes <= thresholdsMinutes[type];
}
function costDonut(entries: Array<{ value: number; accent: string }>): string {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return "conic-gradient(#dfe7e5 0deg 360deg)";
  let cursor = 0;
  const stops = entries.map((entry) => {
    const start = cursor;
    cursor += (entry.value / total) * 360;
    return `${entry.accent} ${start.toFixed(2)}deg ${cursor.toFixed(2)}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${Number((bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)).toLocaleString()} ${units[index]}`;
}
function regionName(region: string): string {
  return region === "ap-south-1" ? "Mumbai" : region === "ap-south-2" ? "Hyderabad" : region;
}
function formatDateTime(value?: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(date);
}
function formatRelative(value?: string | null): string {
  if (!value) return "unavailable";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
function latestBackupAt(inventory?: AwsProfileInventory): string | null {
  if (!inventory) return null;
  const timestamps = [
    ...inventory.s3Backups.flatMap((item) => [
      item.metric.latest?.lastModified ?? null,
    ]),
    ...inventory.buckets.flatMap((bucket) =>
      bucket.latestObjects.map((object) => object.lastModified),
    ),
  ].filter((value): value is string => Boolean(value));
  return (
    timestamps.sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null
  );
}
function shortKey(key: string): string {
  const parts = key.split("/");
  return parts.at(-1) ?? key;
}
function syncAllResult(step: string, profiles: AwsProfileInventory[], status: AwsConnectorStatus, target: "all" | ClientName): string {
  const scopedProfiles = target === "all" ? profiles : profiles.filter((profile) => profile.client === target);
  if (step === "Profile validation") return target === "all" ? `${status.connected}/${status.expected} accounts verified` : `${target} profile ${status.profiles.find((profile) => profile.client === target)?.connected ? "verified" : "unavailable"}`;
  if (step === "AWS inventory")
    return `${scopedProfiles.reduce((n, p) => n + p.instances.length, 0)} instances · ${scopedProfiles.reduce((n, p) => n + p.buckets.length, 0)} S3 buckets · ${scopedProfiles.reduce((n, p) => n + p.s3Backups.reduce((m, b) => m + b.metric.monthCount, 0), 0)} current-month backup objects · ${scopedProfiles.reduce((n, p) => n + p.errors.length, 0)} issues`;
  return "Billing, infrastructure, and backup health recomputed";
}
function AppIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    clients: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2" />
        <path d="M3 20c0-4 2-7 6-7s6 3 6 7M15 14c3 0 5 2 5 5" />
      </>
    ),
    billing: (
      <>
        <path d="M6 2h9l4 4v16H6z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </>
    ),
    servers: (
      <>
        <rect x="3" y="4" width="18" height="6" rx="2" />
        <rect x="3" y="14" width="18" height="6" rx="2" />
        <path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" />
      </>
    ),
    cloud: (
      <path d="M17.5 19H7a5 5 0 0 1-.8-9.94A7 7 0 0 1 19.6 11.5 3.8 3.8 0 0 1 17.5 19Z" />
    ),
    network: (
      <>
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="5" cy="18" r="2.5" />
        <circle cx="19" cy="18" r="2.5" />
        <path d="m10.8 7.2-4.6 8.4M13.2 7.2l4.6 8.4M7.5 18h9" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5.1-3.4 8.7-8 10-4.6-1.3-8-4.9-8-10V6z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.8 20h18.4z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    reports: (
      <>
        <path d="M4 21V10M10 21V4M16 21v-7M22 21H2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0L7 9m5-5 5 5" />
        <path d="M5 15v5h14v-5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 9A7 7 0 0 1 18.8 7M17.9 15A7 7 0 0 1 5.2 17" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z" />
        <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8z" />
      </>
    ),
    dollar: (
      <>
        <path d="M12 2v20" />
        <path d="M17 6.5c-1-1-2.4-1.5-4.2-1.5-2.2 0-3.8 1.1-3.8 2.8 0 4.2 8 2.1 8 6.4 0 1.7-1.6 2.8-3.8 2.8-2 0-3.7-.6-5-1.9" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3" />
      </>
    ),
    sigma: <path d="M18 4H6l6 8-6 8h12" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
        <path d="M5 20h14" />
      </>
    ),
    printer: (
      <>
        <path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z" />
        <path d="M17 12h.01" />
      </>
    ),
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function formatPercent(value: number, showPositiveSign = false) {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  return `${showPositiveSign && normalized > 0 ? "+" : ""}${normalized.toFixed(1)}%`;
}
function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
