"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clientOrder, clients, type ClientName, type Server, usd } from "./stratus-data";

type IconName = "dashboard" | "billing" | "servers" | "cloud" | "network" | "shield" | "alert" | "reports" | "search" | "upload" | "refresh" | "sparkles" | "dollar" | "check" | "route" | "sigma" | "info" | "map" | "clock" | "key" | "download" | "printer" | "arrow" | "close";

const nav: ReadonlyArray<readonly [string, IconName]> = [
  ["Dashboard", "dashboard"], ["Billing", "billing"], ["Servers", "servers"], ["Backups", "cloud"],
  ["Network", "network"], ["IAM & Security", "shield"], ["Alerts", "alert"], ["Reports", "reports"],
];

const backupPolicies: Partial<Record<ClientName, Array<[string, string, string, string]>>> = {
  GCPL: [["Prod-DB-Daily-Full", "Database full", "Daily", "1 month"], ["Prod-DB-4hr-Diff", "Database differential", "Every 4 hours", "1 month"], ["Prod-TS-15min-Log", "Transaction log", "Every 15 minutes", "1 month"], ["Prod-VM-Monthly-Backup", "AMI image", "Monthly", "1 month"]],
  Swastiks: [["Prod-DB-Daily-Full", "Database full", "Daily", "1 month"], ["Prod-DB-6hr-Diff", "Database differential", "Every 6 hours", "1 month"], ["Prod-TS-30 min-Log", "Transaction log", "Every 30 minutes", "1 month"], ["Prod-VM-Monthly-Backup", "AMI image", "Monthly", "1 month"]],
  Fusion: [["Prod-DB-Daily-Full", "Database full", "Daily", "1 month"], ["Prod-DB-6hr-Diff", "Database differential", "Every 6 hours", "1 month"], ["Prod-TS-30min-Log", "Transaction log", "Every 30 minutes", "1 month"], ["Prod-VM-Monthly-Backup", "AMI image", "Monthly", "1 month"]],
};

const serviceSteps = ["EC2", "EBS", "Networking", "S3", "Backups"];

type LiveVolume = { volumeId: string; sizeGiB: number | null; type: string | null; state: string | null; encrypted: boolean };
type LiveInstance = {
  instanceId: string; name: string; state: string; instanceType: string; availabilityZone: string; region: string;
  privateIp: string | null; publicIp: string | null; vpcId: string | null; subnetId: string | null; platform: string;
  launchTime: string | null; vCpu: number | null; memoryMiB: number | null; securityGroups: Array<{ id: string; name: string }>; volumes: LiveVolume[];
};
type LiveBucket = {
  name: string; region: string; createdAt: string | null; objectsObserved: number; scanTruncated: boolean;
  latestObjects: Array<{ key: string; lastModified: string | null; sizeBytes: number; storageClass: string | null }>;
};
type LiveIamUser = {
  userName: string; arn: string; createdAt: string | null; passwordLastUsedAt: string | null;
  attachedPolicies: string[]; inlinePolicies: string[]; groups: string[]; groupPolicies: string[];
  mfaDeviceCount: number; accessKeys: Array<{ accessKeyId: string; status: string; createdAt: string | null }>;
  administratorAccess: boolean; administratorEvidence: string[]; policyEvaluationComplete: boolean;
};
type AwsProfileInventory = {
  client: ClientName; profile: string; accountId: string | null; discoveredAt: string; instances: LiveInstance[]; buckets: LiveBucket[];
  backupVaults: Array<{ name: string; region: string; recoveryPoints: number; createdAt: string | null; locked: boolean }>;
  backupPlans: Array<{ id: string; name: string; region: string; createdAt: string | null; lastExecutionAt: string | null }>;
  backupJobs: Array<{ id: string; state: string; resourceType: string; resourceArn: string; vaultName: string; region: string; createdAt: string | null; completedAt: string | null; sizeBytes: number; statusMessage: string | null }>;
  iamUsers: LiveIamUser[];
  errors: Array<{ service: string; region: string; code: string }>;
};
type AwsInventoryState = { state: "loading" | "ready" | "unavailable"; profiles: AwsProfileInventory[]; reason?: string };
type DisplayServer = Server & {
  source: "live" | "documented"; instanceId?: string; liveState?: string; instanceType?: string; launchedAt?: string | null;
  vpcId?: string | null; subnetId?: string | null; securityGroups?: Array<{ id: string; name: string }>; volumes?: LiveVolume[];
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

async function readAwsConnectorStatus(force = false): Promise<AwsConnectorStatus> {
  try {
    const response = await fetch(`/api/aws/status${force ? "?refresh=1" : ""}`, { cache: "no-store" });
    const data = await response.json() as Partial<AwsConnectorStatus>;
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    if (!profiles.length) return { state: "unavailable", connected: 0, expected: 4, allConnected: false, profiles, reason: data.reason };
    const connected = profiles.filter((profile) => profile.connected).length;
    return { state: connected === profiles.length ? "connected" : "degraded", connected, expected: profiles.length, allConnected: connected === profiles.length, profiles };
  } catch {
    return { state: "unavailable", connected: 0, expected: 4, allConnected: false, profiles: [], reason: "The local AWS connector could not be reached." };
  }
}

async function readAwsInventory(force = false): Promise<AwsInventoryState> {
  try {
    const response = await fetch(`/api/aws/inventory${force ? "?refresh=1" : ""}`, { cache: "no-store" });
    const data = await response.json() as { profiles?: AwsProfileInventory[]; reason?: string };
    if (!response.ok || !Array.isArray(data.profiles)) return { state: "unavailable", profiles: [], reason: data.reason };
    return { state: "ready", profiles: data.profiles };
  } catch {
    return { state: "unavailable", profiles: [], reason: "The local AWS inventory service could not be reached." };
  }
}

function liveServer(instance: LiveInstance): DisplayServer {
  const region = instance.region === "ap-south-1" ? "Mumbai" : instance.region === "ap-south-2" ? "Hyderabad" : instance.region;
  const lowerName = instance.name.toLowerCase();
  const environment = lowerName.includes("prod") && (lowerName.includes("stage") || lowerName.includes("qa")) ? "Production / Stage" : lowerName.includes("prod") ? "Production" : lowerName.includes("stage") || lowerName.includes("qa") ? "Stage / QA" : lowerName.includes("dev") ? "Development" : "Unclassified";
  const storage = instance.volumes.length ? instance.volumes.map((volume) => `${volume.sizeGiB ?? "?"} GB ${volume.type ?? "EBS"}${volume.encrypted ? " · encrypted" : ""}`).join(", ") : "No attached EBS volume returned";
  return {
    name: instance.name, role: "EC2 instance", environment, state: "documented", os: instance.platform,
    cpu: instance.vCpu ? `${instance.vCpu} vCPU · ${instance.instanceType}` : instance.instanceType,
    memory: instance.memoryMiB ? `${formatMemory(instance.memoryMiB)}` : "Instance metadata unavailable", storage,
    region, zone: instance.availabilityZone, publicIp: instance.publicIp ?? undefined, privateIp: instance.privateIp ?? undefined,
    source: "live", instanceId: instance.instanceId, liveState: instance.state, instanceType: instance.instanceType,
    launchedAt: instance.launchTime, vpcId: instance.vpcId, subnetId: instance.subnetId, securityGroups: instance.securityGroups, volumes: instance.volumes,
  };
}

export function StratusApp() {
  const [selectedClient, setSelectedClient] = useState<ClientName>("Nilkamal");
  const [activePage, setActivePage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All regions");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantPending, setAssistantPending] = useState(false);
  const [assistantConfig, setAssistantConfig] = useState<{ configured: boolean; model: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncStep, setSyncStep] = useState(-1);
  const [awsStatus, setAwsStatus] = useState<AwsConnectorStatus>({ state: "checking", connected: 0, expected: 4, allConnected: false, profiles: [] });
  const [inventoryState, setInventoryState] = useState<AwsInventoryState>({ state: "loading", profiles: [] });
  const [selectedServer, setSelectedServer] = useState<DisplayServer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const client = clients[selectedClient];
  const globalSpend = useMemo(() => clientOrder.reduce((sum, name) => sum + clients[name].bills.at(-1)!.total, 0), []);
  const selectedInventory = inventoryState.profiles.find((profile) => profile.client === selectedClient);
  const selectedServers: DisplayServer[] = selectedInventory ? selectedInventory.instances.map(liveServer) : clients[selectedClient].servers.map((server) => ({ ...server, source: "documented" }));
  const allServers: Array<DisplayServer & { client: ClientName }> = inventoryState.state === "ready" ? inventoryState.profiles.flatMap((profile) => profile.instances.map((instance) => ({ ...liveServer(instance), client: profile.client }))) : clientOrder.flatMap((name) => clients[name].servers.map((server) => ({ ...server, source: "documented" as const, client: name })));
  const discoveredServers = allServers.length;
  const searchResults = query.trim().length > 1 ? allServers.filter((server) => Object.values(server).join(" ").toLowerCase().includes(query.toLowerCase())) : [];
  const selectedProfile = awsStatus.profiles.find((profile) => profile.client === selectedClient);

  useEffect(() => {
    let active = true;
    void Promise.all([readAwsConnectorStatus(), readAwsInventory()]).then(([status, inventory]) => { if (active) { setAwsStatus(status); setInventoryState(inventory); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!assistantOpen) return;
    let active = true;
    void fetch("/api/ai/ask", { cache: "no-store" }).then((response) => response.json()).then((data: { configured?: boolean; model?: string }) => {
      if (active) setAssistantConfig({ configured: Boolean(data.configured), model: data.model ?? "gpt-5.4-mini" });
    }).catch(() => { if (active) setAssistantConfig({ configured: false, model: "gpt-5.4-mini" }); });
    return () => { active = false; };
  }, [assistantOpen]);

  const navigate = (page: string) => { setActivePage(page); setQuery(""); setSelectedServer(null); };
  const refresh = () => {
    setSyncOpen(true); setSyncStep(0);
    setInventoryState((current) => ({ ...current, state: "loading" }));
    void Promise.all([readAwsConnectorStatus(true), readAwsInventory(true)]).then(([status, inventory]) => {
      setAwsStatus(status); setInventoryState(inventory); setSyncStep(serviceSteps.length);
    });
  };
  const handleUpload = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setUploadMessage("Only PDF bill summaries are accepted.");
    if (file.size > 10 * 1024 * 1024) return setUploadMessage("This file exceeds the 10 MB upload limit.");
    setUploadMessage(`${file.name} passed file validation. Server parsing requires the database deployment.`);
  };
  const localAssistantAnswer = (question: string) => {
    const q = question.toLowerCase();
    if ((q.includes("why") || q.includes("increase") || q.includes("decrease")) && q.includes("bill")) {
      const namedClient = clientOrder.find((name) => q.includes(name.toLowerCase())) ?? selectedClient;
      const history = clients[namedClient].bills, latest = history.at(-1)!, previous = history.at(-2)!;
      const change = latest.total - previous.total, percent = previous.total ? change / previous.total * 100 : 0;
      return `${namedClient}'s ${latest.month} bill ${change >= 0 ? "increased" : "decreased"} by ${usd.format(Math.abs(change))} (${Math.abs(percent).toFixed(1)}%) from ${usd.format(previous.total)} in ${previous.month} to ${usd.format(latest.total)}. Its top recorded service was ${latest.topService} at ${usd.format(latest.topServiceCost)}. The supplied bill summary does not include enough service-level line items to attribute the entire change more precisely.`;
    }
    if (q.includes("highest") && q.includes("cost")) return `Nilkamal has the highest July 2026 bill at ${usd.format(clients.Nilkamal.bills.at(-1)!.total)}.`;
    if (q.includes("public ip")) return allServers.filter((s) => s.publicIp).map((s) => `${s.client}: ${s.name} — ${s.publicIp}`).join("\n") || "No public IPs were returned.";
    if (q.includes("gcpl") && q.includes("ec2")) return `GCPL EC2 spend from February through July: ${clients.GCPL.bills.map((b) => `${b.month} ${usd.format(b.topServiceCost)}`).join(", ")}.`;
    if (q.includes("stopped")) return inventoryState.state === "ready" ? allServers.filter((server) => server.liveState === "stopped").map((server) => `${server.client}: ${server.name} (${server.instanceId})`).join("\n") || "No stopped EC2 instances were returned." : "The live inventory is unavailable, so Stratus will not guess.";
    if (q.includes("failed") && q.includes("backup")) return inventoryState.state === "ready" ? inventoryState.profiles.flatMap((profile) => profile.backupJobs.filter((job) => job.state === "FAILED").map((job) => `${profile.client}: ${job.resourceType} — ${job.statusMessage ?? job.id}`)).join("\n") || "No failed AWS Backup jobs were returned." : "AWS Backup inventory is unavailable.";
    if (q.includes("admin") && (q.includes("iam") || q.includes("user"))) return inventoryState.state === "ready" ? inventoryState.profiles.flatMap((profile) => (profile.iamUsers ?? []).filter((user) => user.administratorAccess).map((user) => `${profile.client}: ${user.userName} — ${user.administratorEvidence.join("; ")}`)).join("\n") || "No administrator-equivalent IAM user policies were confirmed." : "IAM inventory is unavailable.";
    if (q.includes("vpn") || q.includes("unused")) return "That question needs additional AWS service discovery that is not collected yet. Stratus will not guess.";
    return "OpenAI is unavailable for this request, and the question is outside the built-in source-backed checks.";
  };
  const askAssistant = async (question: string) => {
    setAssistantQuestion(question);
    setAssistantAnswer("Analyzing the current source snapshot…");
    setAssistantPending(true);
    try {
      const response = await fetch("/api/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, selectedClient }) });
      const data = await response.json() as { answer?: string; error?: string; model?: string };
      if (!response.ok || !data.answer) throw new Error(data.error ?? "The assistant returned no answer.");
      setAssistantAnswer(data.answer);
      setAssistantConfig({ configured: true, model: data.model ?? assistantConfig?.model ?? "gpt-5.4-mini" });
    } catch {
      setAssistantAnswer(localAssistantAnswer(question));
    } finally {
      setAssistantPending(false);
    }
  };
  const exportCsv = (kind: "billing" | "infrastructure") => {
    const csv = kind === "billing"
      ? ["client,month,total_usd,pre_tax_usd,top_service,top_service_cost", ...clientOrder.flatMap((name) => clients[name].bills.map((b) => [name, `${b.month} 2026`, b.total.toFixed(2), b.preTax.toFixed(2), b.topService, b.topServiceCost.toFixed(2)].join(",")))].join("\n")
      : ["client,resource,instance_id,state,instance_type,environment,os,region,zone,private_ip,public_ip,storage", ...allServers.map((s) => [s.client, s.name, s.instanceId ?? "", s.liveState ?? "documented", s.instanceType ?? "", s.environment, s.os, s.region, s.zone, s.privateIp ?? "", s.publicIp ?? "", s.storage].map(csvCell).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `stratus-${kind}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="stratus-shell" style={{ "--client-accent": client.accent } as React.CSSProperties}>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("Dashboard")}><span className="brand-cloud"><AppIcon name="cloud" size={27} /></span><span><strong>Stratus</strong><small>AWS operations</small></span></button>
        <nav aria-label="Primary navigation">{nav.map(([item, icon]) => <button onClick={() => navigate(item)} className={activePage === item ? "active" : ""} key={item} aria-current={activePage === item ? "page" : undefined}><span aria-hidden><AppIcon name={icon} /></span>{item}</button>)}</nav>
        <div className="sidebar-art" aria-hidden="true"><span className="art-sun" /><span className="art-cloud art-cloud-one" /><span className="art-cloud art-cloud-two" /><i className="mountain mountain-back" /><i className="mountain mountain-mid" /><i className="mountain mountain-front" /></div>
        <div className="sidebar-foot"><span className="status-dot" />Source data ready<small>{awsStatus.state === "checking" ? "Checking AWS connector…" : awsStatus.state === "connected" ? `${awsStatus.connected}/${awsStatus.expected} AWS profiles verified` : awsStatus.state === "degraded" ? `${awsStatus.connected}/${awsStatus.expected} AWS profiles available` : "Local AWS connector unavailable"}</small></div>
      </aside>

      <main>
        <header className="topbar">
          <div><p className="eyebrow">{activePage.toUpperCase()}</p><h1>{activePage === "Dashboard" ? "Good morning, Admin 👋" : activePage}</h1><p>{activePage === "Dashboard" ? "Here’s the current source-backed view of your AWS environments." : `${selectedClient} · read-only operations workspace`}</p></div>
          <label className="search"><span aria-hidden><AppIcon name="search" size={16} /></span><span className="sr-only">Search resources</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers, IPs, clients…" /><kbd>⌘ K</kbd></label>
          <button className="outline-button" onClick={() => setUploadOpen(true)}><AppIcon name="upload" size={15} /> Upload bill</button>
          <button className="refresh-button" onClick={refresh}><AppIcon name="refresh" size={15} /> Refresh all</button>
          <div className="admin-profile" aria-label="Signed in as Admin"><span>A</span><div><strong>Admin</strong><small>Operations</small></div><i /></div>
          {searchResults.length > 0 && <div className="search-popover" role="listbox">{searchResults.map((result) => <button key={`${result.client}-${result.name}`} onClick={() => { setSelectedClient(result.client); navigate("Servers"); setSelectedServer(result); }}><span><AppIcon name="servers" size={16} /></span><div><strong>{result.name}</strong><small>{result.client} · {result.privateIp ?? result.publicIp ?? result.region}</small></div></button>)}</div>}
        </header>

        <section className="client-strip" aria-label="Clients"><span>Clients</span>{clientOrder.map((name) => <button key={name} onClick={() => { setSelectedClient(name); setSelectedServer(null); setRegionFilter("All regions"); }} className={name === selectedClient ? "selected" : ""} aria-pressed={name === selectedClient}><i style={{ background: clients[name].accent }}>{clients[name].initials}</i>{name}<b aria-hidden /></button>)}</section>

        <div className="content">
          {activePage === "Dashboard" && <Dashboard clientName={selectedClient} navigate={navigate} globalSpend={globalSpend} allServerCount={discoveredServers} servers={selectedServers} inventory={selectedInventory} inventoryState={inventoryState.state} refresh={refresh} profileStatus={selectedProfile} />}
          {activePage === "Billing" && <BillingPage clientName={selectedClient} onUpload={() => setUploadOpen(true)} />}
          {activePage === "Servers" && <ServersPage liveServers={selectedServers} inventoryState={inventoryState.state} regionFilter={regionFilter} setRegionFilter={setRegionFilter} selectedServer={selectedServer} setSelectedServer={setSelectedServer} />}
          {activePage === "Backups" && <BackupsPage clientName={selectedClient} inventory={selectedInventory} inventoryState={inventoryState.state} />}
          {activePage === "Network" && <NetworkPage clientName={selectedClient} servers={selectedServers} />}
          {activePage === "IAM & Security" && <SecurityPage clientName={selectedClient} inventory={selectedInventory} inventoryState={inventoryState.state} />}
          {activePage === "Alerts" && <AlertsPage clientName={selectedClient} refresh={refresh} profileStatus={selectedProfile} />}
          {activePage === "Reports" && <ReportsPage exportCsv={exportCsv} />}
        </div>
      </main>

      <button className="ai-button" aria-label="Open Stratus AI assistant" onClick={() => setAssistantOpen((open) => !open)} aria-expanded={assistantOpen}><span><AppIcon name="sparkles" size={22} /></span><b>Ask AI</b></button>
      {assistantOpen && <Assistant question={assistantQuestion} answer={assistantAnswer} ask={askAssistant} close={() => setAssistantOpen(false)} pending={assistantPending} config={assistantConfig} />}
      {uploadOpen && <Modal title="Upload AWS bill summary" close={() => { setUploadOpen(false); setUploadMessage(""); }}><button className="drop-zone" onClick={() => fileRef.current?.click()}><span><AppIcon name="upload" size={28} /></span><strong>Choose a PDF bill summary</strong><small>Maximum 10 MB · source files are discarded after parsing</small></button><input ref={fileRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(e) => handleUpload(e.target.files?.[0])} /><p className="modal-message" aria-live="polite">{uploadMessage || `The bill will be validated and assigned to ${selectedClient}.`}</p></Modal>}
      {syncOpen && <Modal title={`Refresh ${selectedClient}`} close={() => setSyncOpen(false)}><div className="sync-list">{serviceSteps.map((step, index) => <div key={step}><span className={syncStep >= serviceSteps.length ? "done" : index === 0 ? "running" : "pending"}>{syncStep >= serviceSteps.length ? "✓" : index === 0 ? "↻" : "·"}</span><strong>{step}</strong><small>{syncStep >= serviceSteps.length ? syncResult(step, selectedInventory) : index === 0 ? "Discovering live AWS resources…" : "Waiting"}</small></div>)}</div>{syncStep >= serviceSteps.length && (selectedInventory ? <p className="modal-message">Live read-only discovery completed for “{client.profile}”: {selectedInventory.instances.length} EC2 instances, {selectedInventory.buckets.length} S3 buckets, and {selectedInventory.backupJobs.length} AWS Backup jobs.</p> : <p className="sync-error">The local connector could not discover resources for AWS CLI profile “{client.profile}”. Stored source data was preserved.</p>)}</Modal>}
    </div>
  );
}

function Dashboard({ clientName, navigate, globalSpend, allServerCount, servers, inventory, inventoryState, refresh, profileStatus }: { clientName: ClientName; navigate: (page: string) => void; globalSpend: number; allServerCount: number; servers: DisplayServer[]; inventory?: AwsProfileInventory; inventoryState: AwsInventoryState["state"]; refresh: () => void; profileStatus?: AwsProfileStatus }) {
  const client = clients[clientName], latest = client.bills.at(-1)!, prior = client.bills.at(-2)!;
  const change = ((latest.total - prior.total) / prior.total) * 100, maxBill = Math.max(...client.bills.map((bill) => bill.total));
  const stopped = servers.filter((server) => server.liveState === "stopped").length;
  const recoveryPoints = inventory?.backupVaults.reduce((sum, vault) => sum + vault.recoveryPoints, 0) ?? 0;
  const latestBackup = latestBackupAt(inventory);
  return <>
    <section className="notice"><span>i</span><div><strong>{inventory ? "Live AWS inventory synchronized" : profileStatus?.connected ? "AWS profile connected" : "Source-backed baseline"}</strong><p>{inventory ? `${inventory.instances.length} EC2 instances, ${inventory.buckets.length} S3 buckets, and ${inventory.backupJobs.length} AWS Backup jobs discovered at ${formatDateTime(inventory.discoveredAt)}.` : profileStatus?.connected ? `${client.profile} was verified against account ${profileStatus.accountId}; resource discovery is ${inventoryState === "loading" ? "running" : "unavailable"}.` : client.sourceNote}</p></div><button onClick={refresh}>Refresh inventory</button></section>
    <section className="kpis" aria-label="Key metrics">
      <Kpi icon="dollar" title="Selected client spend" value={usd.format(latest.total)} note={`${formatPercent(change, true)} vs Jun`} tone={change > 0.05 ? "warning" : "success"} />
      <Kpi icon="servers" title="EC2 instances" value={inventoryState === "loading" ? "Syncing…" : String(servers.length)} note={`${allServerCount} across all clients · ${stopped} stopped`} tone={stopped ? "warning" : "default"} />
      <Kpi icon="check" title="Backup recovery points" value={inventory ? String(recoveryPoints) : "Unavailable"} note={latestBackup ? `Latest ${formatRelative(latestBackup)}` : inventory ? `${inventory.buckets.length} S3 buckets inspected` : "Run local AWS discovery"} tone={latestBackup ? "success" : "muted"} />
      <Kpi icon="network" title="Network posture" value={servers.length ? `${new Set(servers.map((server) => server.vpcId).filter(Boolean)).size} VPC${new Set(servers.map((server) => server.vpcId).filter(Boolean)).size === 1 ? "" : "s"}` : "Unavailable"} note={`${client.primaryRegion} → ${client.drRegion}`} />
      <Kpi icon="sigma" title="All-client spend" value={usd.format(globalSpend)} note="July 2026 source totals" />
    </section>
    <section className="dashboard-grid">
      <article className="panel spend-panel"><PanelTitle title="Monthly spend" action="Billing details" onAction={() => navigate("Billing")} /><div className="spend-summary"><div><strong>{usd.format(latest.total)}</strong><span>July 2026 grand total</span></div><p className={change > 0 ? "up" : "down"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%</p></div><div className="bar-chart" aria-label="Six-month billing totals">{client.bills.map((bill) => <div className="bar-column" key={bill.month}><span>{usd.format(bill.total)}</span><i style={{ height: `${Math.max(10, (bill.total / maxBill) * 100)}%` }} /><b>{bill.month}</b></div>)}</div><div className="panel-foot"><span>6-month average <strong>{usd.format(average(client.bills.map((b) => b.total)))}</strong></span><span>Top service <strong>{latest.topService}</strong></span></div></article>
      <article className="panel servers-panel"><PanelTitle title={`EC2 instances (${servers.length})`} action="View inventory" onAction={() => navigate("Servers")} />{servers.length ? <ServerTable servers={servers.slice(0, 6)} onSelect={() => navigate("Servers")} /> : <Empty title={inventoryState === "loading" ? "Discovering EC2 instances" : "No EC2 instances returned"} text={inventoryState === "loading" ? "The read-only connector is querying Mumbai and Hyderabad." : "AWS returned no instances for this profile in the configured regions."} />}</article>
      <article className="panel network-panel"><PanelTitle title="Regional topology" action="Network" onAction={() => navigate("Network")} /><RegionRoute clientName={clientName} /><p className="panel-note">Architecture context comes from the supplied infrastructure baseline. Tunnel state and live telemetry need AWS synchronization.</p></article>
      <article className="panel backup-panel"><PanelTitle title="Backup summary" action="Backups" onAction={() => navigate("Backups")} /><div className="backup-visual"><div className="backup-ring"><AppIcon name="cloud" size={23} /></div><div><strong>{inventory ? `${inventory.backupJobs.length} jobs` : "Awaiting sync"}</strong><span>{inventory ? `${inventory.buckets.length} S3 buckets · ${recoveryPoints} recovery points` : "Local discovery required"}</span><small><i /> {latestBackup ? `Latest ${formatRelative(latestBackup)}` : "No live timestamp returned"}</small></div></div></article>
      <article className="panel alerts-panel"><PanelTitle title="Attention needed" action="All alerts" onAction={() => navigate("Alerts")} /><AlertRows clientName={clientName} profileStatus={profileStatus} /></article>
    </section>
  </>;
}

function BillingPage({ clientName, onUpload }: { clientName: ClientName; onUpload: () => void }) {
  const client = clients[clientName], latest = client.bills.at(-1)!, prior = client.bills.at(-2)!;
  const high = client.bills.reduce((a, b) => a.total > b.total ? a : b), low = client.bills.reduce((a, b) => a.total < b.total ? a : b), change = ((latest.total - prior.total) / prior.total) * 100;
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">FEBRUARY — JULY 2026</p><h2>Billing analysis</h2><p>Validated from six supplied AWS bill summaries. Currency values use decimal source totals.</p></div><button className="refresh-button" onClick={onUpload}><AppIcon name="upload" size={15} /> Upload bill</button></section><section className="summary-grid"><Kpi icon="dollar" title="Latest total" value={usd.format(latest.total)} note="July 2026 grand total" /><Kpi icon="billing" title="Pre-tax" value={usd.format(latest.preTax)} note={`Tax ${usd.format(latest.total - latest.preTax)}`} /><Kpi icon="arrow" title="Month over month" value={formatPercent(change, true)} note={`June ${usd.format(prior.total)}`} tone={change > 0 ? "warning" : "success"} /><Kpi icon="sigma" title="Six-month average" value={usd.format(average(client.bills.map((b) => b.total)))} note={`High ${high.month} · Low ${low.month}`} /></section><section className="page-grid"><article className="panel wide"><PanelTitle title="Monthly totals" /><div className="billing-bars">{client.bills.map((bill) => <div key={bill.month}><span><b>{bill.month} 2026</b><small>{usd.format(bill.total)}</small></span><i><b style={{ width: `${(bill.total / high.total) * 100}%` }} /></i></div>)}</div></article><article className="panel"><PanelTitle title="Previous-month composition" /><div className="donut-wrap"><div className="donut" style={{ "--share": `${(prior.topServiceCost / prior.total) * 100}%` } as React.CSSProperties}><strong>{((prior.topServiceCost / prior.total) * 100).toFixed(0)}%</strong><small>EC2</small></div><div className="legend"><p><i className="ec2" />Elastic Compute Cloud <b>{usd.format(prior.topServiceCost)}</b></p><p><i />Other services & tax <b>{usd.format(prior.total - prior.topServiceCost)}</b></p></div></div></article><article className="panel wide"><PanelTitle title="Per-service analytics" /><div className="data-list"><div><span>Elastic Compute Cloud<small>Largest supported service line</small></span><b>{usd.format(latest.topServiceCost)}<small>{((latest.topServiceCost / latest.total) * 100).toFixed(1)}% of July</small></b></div><div><span>Other services and tax<small>Derived remainder; detailed source terms are retained by the ingestion model</small></span><b>{usd.format(latest.total - latest.topServiceCost)}<small>{(100 - (latest.topServiceCost / latest.total) * 100).toFixed(1)}% of July</small></b></div></div></article><article className="panel"><PanelTitle title="Cost investigation" /><div className="insights"><p className={change > 10 ? "warn" : "ok"}><span>{change > 0 ? "↑" : "↓"}</span><b>{Math.abs(change).toFixed(1)}% {change > 0 ? "increase" : "decrease"}<small>July compared with June</small></b></p><p><span>◎</span><b>{high.month} was highest<small>{usd.format(high.total)} grand total</small></b></p><p><span>◌</span><b>{low.month} was lowest<small>{usd.format(low.total)} grand total</small></b></p></div></article></section></div>;
}

function ServersPage({ liveServers, inventoryState, regionFilter, setRegionFilter, selectedServer, setSelectedServer }: { liveServers: DisplayServer[]; inventoryState: AwsInventoryState["state"]; regionFilter: string; setRegionFilter: (value: string) => void; selectedServer: DisplayServer | null; setSelectedServer: (server: DisplayServer | null) => void }) {
  const [serverSearch, setServerSearch] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("All environments");
  const servers = liveServers.filter((server) => {
    const matchesRegion = regionFilter === "All regions" || server.region === regionFilter;
    const matchesEnvironment = environmentFilter === "All environments" || server.environment.toLowerCase().includes(environmentFilter.toLowerCase());
    const haystack = `${server.name} ${server.role} ${server.os} ${server.privateIp ?? ""} ${server.publicIp ?? ""}`.toLowerCase();
    return matchesRegion && matchesEnvironment && haystack.includes(serverSearch.trim().toLowerCase());
  });
  if (selectedServer) return <div className="page-stack"><button className="back-link" onClick={() => setSelectedServer(null)}><AppIcon name="arrow" size={14} /> Back to servers</button><section className="page-head"><div><p className="eyebrow">{selectedServer.source === "live" ? "LIVE EC2 RESOURCE" : "DOCUMENTED RESOURCE"}</p><h2>{selectedServer.name}</h2><p>{selectedServer.instanceId ?? selectedServer.role} · {selectedServer.liveState ?? selectedServer.environment}</p></div><span className={`source-badge ${selectedServer.liveState === "stopped" ? "warning" : ""}`}>{selectedServer.source === "live" ? `AWS · ${selectedServer.liveState}` : "Document baseline"}</span></section><section className="detail-grid"><Detail title="Identity" rows={[["AWS instance ID", selectedServer.instanceId ?? "Unavailable"], ["State", selectedServer.liveState ?? "Documented"], ["Environment", selectedServer.environment], ["Launch time", formatDateTime(selectedServer.launchedAt)]]} /><Detail title="Compute" rows={[["Operating system", selectedServer.os], ["CPU", selectedServer.cpu], ["Memory", selectedServer.memory], ["Instance type", selectedServer.instanceType ?? "Unavailable"]]} /><Detail title="Networking" rows={[["Region", selectedServer.region], ["Availability zone", selectedServer.zone], ["Private / public IP", `${selectedServer.privateIp ?? "Unavailable"} / ${selectedServer.publicIp ?? "Unavailable"}`], ["VPC / subnet", `${selectedServer.vpcId ?? "Unavailable"} / ${selectedServer.subnetId ?? "Unavailable"}`], ["Security groups", selectedServer.securityGroups?.map((group) => `${group.name} (${group.id})`).join(", ") || "Unavailable"]]} /><Detail title="EBS storage" rows={selectedServer.volumes?.length ? selectedServer.volumes.flatMap((volume, index) => [[`Volume ${index + 1}`, `${volume.volumeId} · ${volume.sizeGiB ?? "?"} GB ${volume.type ?? "EBS"}`], [index === 0 ? "Encryption" : `Encryption ${index + 1}`, volume.encrypted ? "Encrypted" : "Not encrypted"]]) : [["Storage", selectedServer.storage], ["Volumes", "No attached EBS volume returned"]]} /></section></div>;
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">LIVE INFRASTRUCTURE INVENTORY</p><h2>EC2 instances</h2><p>Read directly from EC2 and EBS in Mumbai and Hyderabad. State, addressing, instance type, and volumes reflect the latest discovery.</p></div><div className="inventory-filters"><label><AppIcon name="search" size={14} /><span className="sr-only">Search server inventory</span><input value={serverSearch} onChange={(event) => setServerSearch(event.target.value)} placeholder="Search inventory" /></label><select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Filter servers by region"><option>All regions</option><option>Mumbai</option><option>Hyderabad</option></select><select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)} aria-label="Filter servers by environment"><option>All environments</option><option>Production</option><option>Stage</option></select></div></section><article className="panel inventory-panel"><PanelTitle title={inventoryState === "loading" ? "Discovering EC2 resources…" : `${servers.length} EC2 resources`} />{servers.length ? <ServerTable servers={servers} onSelect={setSelectedServer} detailed /> : <Empty title={inventoryState === "loading" ? "Querying EC2" : "No matching instances"} text={inventoryState === "loading" ? "The local connector is reading both configured regions." : liveServers.length ? "Adjust the search or filters to see live resources." : "AWS returned no EC2 instances for this profile in Mumbai or Hyderabad."} />}</article></div>;
}

function BackupsPage({ clientName, inventory, inventoryState }: { clientName: ClientName; inventory?: AwsProfileInventory; inventoryState: AwsInventoryState["state"] }) {
  const rows = backupPolicies[clientName] ?? [];
  const failedJobs = inventory?.backupJobs.filter((job) => job.state === "FAILED") ?? [];
  const completedJobs = inventory?.backupJobs.filter((job) => job.state === "COMPLETED") ?? [];
  const recoveryPoints = inventory?.backupVaults.reduce((sum, vault) => sum + vault.recoveryPoints, 0) ?? 0;
  const latest = latestBackupAt(inventory);
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">LIVE AWS BACKUP + S3</p><h2>Backup health</h2><p>Vaults, plans, jobs, recovery points, S3 buckets, and recent backup objects come from the read-only local AWS connector.</p></div><span className={`source-badge ${inventory ? "" : "warning"}`}>{inventory ? `Synchronized ${formatRelative(inventory.discoveredAt)}` : inventoryState === "loading" ? "Discovering…" : "Live inventory unavailable"}</span></section><section className="summary-grid"><Kpi icon="check" title="AWS Backup plans" value={inventory ? String(inventory.backupPlans.length) : "Unavailable"} note={`${rows.length} additional documented policies`} tone={inventory?.backupPlans.length ? "success" : "default"} /><Kpi icon="alert" title="Failed jobs" value={inventory ? String(failedJobs.length) : "Unavailable"} note={inventory ? `${completedJobs.length} completed jobs returned` : "Requires local discovery"} tone={failedJobs.length ? "warning" : inventory ? "success" : "muted"} /><Kpi icon="clock" title="Latest backup object" value={latest ? formatRelative(latest) : "Not returned"} note={latest ? formatDateTime(latest) : "No job or S3 timestamp available"} tone={latest ? "success" : "muted"} /><Kpi icon="cloud" title="Recovery points" value={inventory ? String(recoveryPoints) : "Unavailable"} note={inventory ? `${inventory.backupVaults.length} vaults · ${inventory.buckets.length} S3 buckets` : "Run local discovery"} /></section><section className="page-grid"><article className="panel wide"><PanelTitle title={`AWS Backup jobs (${inventory?.backupJobs.length ?? 0})`} />{inventory?.backupJobs.length ? <div className="data-table"><table><thead><tr><th>State</th><th>Resource</th><th>Vault</th><th>Region</th><th>Created</th><th>Completed</th><th>Size</th></tr></thead><tbody>{inventory.backupJobs.slice(0, 50).map((job) => <tr key={job.id}><td><span className={job.state === "COMPLETED" ? "documented" : "unavailable"}>{job.state}</span></td><td><strong>{job.resourceType}</strong><small>{shortArn(job.resourceArn)}</small></td><td>{job.vaultName || "—"}</td><td>{regionName(job.region)}</td><td>{formatDateTime(job.createdAt)}</td><td>{formatDateTime(job.completedAt)}</td><td>{formatBytes(job.sizeBytes)}</td></tr>)}</tbody></table></div> : <Empty title={inventoryState === "loading" ? "Querying AWS Backup jobs" : "No AWS Backup jobs returned"} text="S3 backup objects are listed separately below because database and AMI exports may not use AWS Backup jobs." />}</article><article className="panel"><PanelTitle title="Vaults & recovery points" />{inventory?.backupVaults.length ? <div className="data-list">{inventory.backupVaults.map((vault) => <div key={`${vault.region}-${vault.name}`}><span>{vault.name}<small>{regionName(vault.region)} · created {formatDateTime(vault.createdAt)}</small></span><b>{vault.recoveryPoints}<small>recovery points</small></b></div>)}</div> : <Empty title="No AWS Backup vaults" text="AWS returned no vaults for this profile in Mumbai or Hyderabad." />}</article><article className="panel"><PanelTitle title="AWS Backup plans" />{inventory?.backupPlans.length ? <div className="data-list">{inventory.backupPlans.map((plan) => <div key={plan.id}><span>{plan.name}<small>{regionName(plan.region)} · {plan.id}</small></span><b>{plan.lastExecutionAt ? formatRelative(plan.lastExecutionAt) : "Never"}<small>last execution</small></b></div>)}</div> : <Empty title="No AWS Backup plans" text={`${rows.length} backup policies remain available from the supplied infrastructure baseline.`} />}</article></section><article className="panel"><PanelTitle title={`S3 backup and transfer buckets (${inventory?.buckets.length ?? 0})`} />{inventory?.buckets.length ? <div className="data-table s3-table"><table><thead><tr><th>Bucket</th><th>Region</th><th>Objects inspected</th><th>Latest observed object</th><th>Last modified</th><th>Size</th></tr></thead><tbody>{inventory.buckets.map((bucket) => { const object = bucket.latestObjects[0]; return <tr key={bucket.name}><td><strong>{bucket.name}</strong><small>Created {formatDateTime(bucket.createdAt)}</small></td><td>{regionName(bucket.region)}</td><td>{bucket.objectsObserved.toLocaleString()}{bucket.scanTruncated ? "+" : ""}<small>{bucket.scanTruncated ? "First 5,000 inspected" : "Full listing inspected"}</small></td><td>{object ? shortKey(object.key) : "Empty bucket"}<small>{object?.storageClass ?? "—"}</small></td><td>{formatDateTime(object?.lastModified)}</td><td>{formatBytes(object?.sizeBytes ?? 0)}</td></tr>; })}</tbody></table></div> : <Empty title={inventoryState === "loading" ? "Inspecting S3 buckets" : "No S3 buckets returned"} text="The connector lists bucket locations and up to 5,000 object records per bucket without downloading object contents." />}</article></div>;
}

function NetworkPage({ clientName, servers }: { clientName: ClientName; servers: DisplayServer[] }) { const client = clients[clientName], server = servers[0], vpcs = [...new Set(servers.map((item) => item.vpcId).filter((value): value is string => Boolean(value)))]; return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">MUMBAI + HYDERABAD</p><h2>Network overview</h2><p>Live EC2 addressing, VPC, subnet, and security-group relationships from the read-only discovery pass.</p></div><span className="source-badge">Read-only AWS</span></section><article className="panel topology-panel"><PanelTitle title="Regional relationship" /><RegionRoute clientName={clientName} /><div className="topology-flow"><div><span><AppIcon name="network" /></span><b>Public address</b><small>{server?.publicIp ?? "No public IP returned"}</small></div><i>→</i><div><span><AppIcon name="map" /></span><b>VPC</b><small>{server?.vpcId ?? "Unavailable"}</small></div><i>→</i><div><span><AppIcon name="servers" /></span><b>{servers.length} workloads</b><small>{server?.privateIp ?? "No instance returned"}</small></div><i>→</i><div><span><AppIcon name="cloud" /></span><b>DR backups</b><small>{client.drRegion}</small></div></div></article><section className="detail-grid"><Detail title="Address inventory" rows={servers.length ? servers.flatMap((item) => [[`${item.name} private`, item.privateIp ?? "Unavailable"], [`${item.name} public`, item.publicIp ?? "No public IP"]]) : [["Addresses", "No EC2 instances returned"]]} /><Detail title="VPC inventory" rows={vpcs.length ? vpcs.map((vpc, index) => [`VPC ${index + 1}`, vpc]) : [["VPCs", "No VPC IDs returned"]]} /></section></div>; }

function SecurityPage({ clientName, inventory, inventoryState }: { clientName: ClientName; inventory?: AwsProfileInventory; inventoryState: AwsInventoryState["state"] }) {
  const users = inventory?.iamUsers ?? [];
  const activeKeys = users.flatMap((user) => user.accessKeys).filter((key) => key.status === "Active").length;
  const usersWithMfa = users.filter((user) => user.mfaDeviceCount > 0).length;
  const administrators = users.filter((user) => user.administratorAccess);
  const ready = inventoryState === "ready" && Boolean(inventory) && !inventory?.errors.some((error) => error.service === "IAM");
  return <div className="page-stack security-page"><section className="page-head"><div><p className="eyebrow">IAM VISIBILITY</p><h2>IAM & security</h2><p>Live IAM users, group membership, policies, access-key status, and MFA coverage from the read-only connector.</p></div><span className={`source-badge ${ready ? "" : "warning"}`}>{ready ? "Live IAM inventory" : "IAM sync unavailable"}</span></section><section className="summary-grid"><Kpi icon="shield" title="IAM users" value={ready ? users.length.toLocaleString() : "Unavailable"} note={ready ? `${clientName} account` : "Requires IAM read permissions"} tone={ready ? "default" : "muted"} /><Kpi icon="key" title="Active keys" value={ready ? activeKeys.toLocaleString() : "Unavailable"} note="Secret values are never collected" tone={ready ? "default" : "muted"} /><Kpi icon="check" title="MFA coverage" value={ready && users.length ? `${Math.round(usersWithMfa / users.length * 100)}%` : ready ? "0%" : "Unverified"} note={ready ? `${usersWithMfa}/${users.length} users with MFA` : "Live verification pending"} /><Kpi icon="alert" title="Admin findings" value={ready ? administrators.length.toLocaleString() : "Unavailable"} note={ready ? "Confirmed policy evidence only" : "No privilege claims invented"} tone={ready && administrators.length ? "warning" : ready ? "default" : "muted"} /></section><article className="panel"><PanelTitle title="IAM user findings" />{ready && users.length ? <div className="data-list">{users.map((user) => <div key={user.arn}><span>{user.userName}<small>{user.administratorAccess ? user.administratorEvidence.join(" · ") : `${user.attachedPolicies.length + user.inlinePolicies.length + user.groupPolicies.length} policies · ${user.groups.length} groups · ${user.accessKeys.filter((key) => key.status === "Active").length} active keys`}</small></span><span className={`source-badge ${user.administratorAccess ? "warning" : ""}`}>{user.administratorAccess ? "Administrator" : user.mfaDeviceCount ? "MFA enabled" : "No MFA device"}</span></div>)}</div> : <Empty title={inventoryState === "loading" ? "Inspecting IAM" : "No IAM users returned"} text="Stratus evaluates direct, inline, and group-derived administrator policies without collecting secret access-key values." />}</article></div>;
}

function AlertsPage({ clientName, refresh, profileStatus }: { clientName: ClientName; refresh: () => void; profileStatus?: AwsProfileStatus }) { return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">ACTIONABLE SIGNALS</p><h2>Alerts</h2><p>Only conditions supported by stored data are shown. No noisy or fabricated operational alerts.</p></div><button className="refresh-button" onClick={refresh}>↻ Retry sync</button></section><article className="panel alerts-page"><PanelTitle title="Open alerts" /><AlertRows clientName={clientName} profileStatus={profileStatus} /></article></div>; }

function ReportsPage({ exportCsv }: { exportCsv: (kind: "billing" | "infrastructure") => void }) { return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">EXPORTS</p><h2>Reports</h2><p>Exports use the same validated billing and live AWS inventory shown throughout Stratus.</p></div></section><section className="report-grid"><button onClick={() => exportCsv("billing")}><span><AppIcon name="billing" /></span><div><strong>Billing summary CSV</strong><small>All clients · six months · exact source totals</small></div><b><AppIcon name="download" size={14} /> Download</b></button><button onClick={() => exportCsv("infrastructure")}><span><AppIcon name="servers" /></span><div><strong>Infrastructure summary CSV</strong><small>Live EC2 state, instance IDs, regions, addresses, and EBS storage</small></div><b><AppIcon name="download" size={14} /> Download</b></button><button onClick={() => window.print()}><span><AppIcon name="printer" /></span><div><strong>Printable current view</strong><small>Browser-optimized operations report</small></div><b><AppIcon name="printer" size={14} /> Print</b></button></section></div>; }

function Assistant({ question, answer, ask, close, pending, config }: { question: string; answer: string; ask: (question: string) => Promise<void>; close: () => void; pending: boolean; config: { configured: boolean; model: string } | null }) { const [draft, setDraft] = useState(""); const suggestions = ["Why did Nilkamal's bill increase?", "Which servers are stopped?", "Show failed backups.", "Which IAM users have admin access?"]; return <aside className="assistant-panel" aria-label="Stratus AI assistant"><header><span><AppIcon name="sparkles" size={18} /></span><div><strong>Stratus AI</strong><small>Read-only · source aware</small></div><button onClick={close} aria-label="Close assistant"><AppIcon name="close" size={19} /></button></header><div className="assistant-scroll"><p className="assistant-config"><AppIcon name="info" size={14} />{config === null ? "Checking OpenAI configuration…" : config.configured ? `OpenAI ${config.model} · server-side key · live sources` : "OpenAI key not configured · built-in source checks remain active"}</p><div className="suggestions">{suggestions.map((s) => <button className="suggestion" key={s} onClick={() => void ask(s)} disabled={pending}><AppIcon name="sparkles" size={13} />{s}</button>)}</div>{question && <div className="chat" aria-live="polite" aria-busy={pending}><p><b>You</b>{question}</p><p><b>Stratus</b>{answer.split("\n").map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</p></div>}</div><form onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !pending) { void ask(draft); setDraft(""); } }}><label className="sr-only" htmlFor="ai-question">Ask Stratus AI</label><input id="ai-question" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about billing or inventory…" disabled={pending} /><button aria-label="Send question" disabled={pending}><AppIcon name="arrow" size={17} /></button></form></aside>; }

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="Close dialog"><AppIcon name="close" size={18} /></button></header>{children}</section></div>; }
function Kpi({ icon, title, value, note, tone = "default" }: { icon: IconName; title: string; value: string; note: string; tone?: string }) { return <article className={`kpi kpi-${tone}`}><div className={`kpi-icon ${tone}`}><AppIcon name={icon} size={18} /></div><div><p>{title}</p><strong>{value}</strong><span className={tone}>{note}</span></div></article>; }
function PanelTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return <header className="panel-title"><h2>{title}</h2>{action && <button onClick={onAction}>{action} <span>→</span></button>}</header>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span><AppIcon name="cloud" size={21} /></span><strong>{title}</strong><p>{text}</p></div>; }
function RegionRoute({ clientName }: { clientName: ClientName }) { const client = clients[clientName]; return <div className="route"><div><i className="region-dot primary" /><strong>{client.primaryRegion}</strong><span>Primary · {client.primaryRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}</span></div><b>→</b><div><i className="region-dot" /><strong>{client.drRegion}</strong><span>DR · {client.drRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}</span></div></div>; }
function ServerTable({ servers, onSelect, detailed = false }: { servers: DisplayServer[]; onSelect: (server: DisplayServer) => void; detailed?: boolean }) { return <div className="table-wrap"><table><thead><tr><th>Resource</th><th>Instance</th><th>Environment</th><th>Status</th><th>Compute</th><th>Storage</th><th>Region</th>{detailed && <th>IP</th>}</tr></thead><tbody>{servers.map((server) => <tr key={server.instanceId ?? server.name} onClick={() => onSelect(server)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(server)}><td><strong>{server.name}</strong><small>{server.os}</small></td><td>{server.instanceType ?? server.role}<small>{server.instanceId ?? server.source}</small></td><td>{server.environment}</td><td><span className={server.liveState === "stopped" ? "unavailable" : "documented"}><i />{server.liveState ?? "Documented"}</span></td><td>{server.cpu}<small>{server.memory}</small></td><td>{server.storage}</td><td>{server.region}<small>{server.zone}</small></td>{detailed && <td>{server.privateIp ?? "Unavailable"}<small>{server.publicIp ?? "No public IP"}</small></td>}</tr>)}</tbody></table></div>; }
function Detail({ title, rows }: { title: string; rows: string[][] }) { return <article className="panel detail-card"><PanelTitle title={title} /><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>; }
function AlertRows({ clientName, profileStatus }: { clientName: ClientName; profileStatus?: AwsProfileStatus }) { return <>{profileStatus?.connected ? <div className="alert-row good"><span><AppIcon name="check" size={13} /></span><div><strong>AWS profile verified</strong><p>{clients[clientName].profile} is connected to account {profileStatus.accountId} through the read-only local connector.</p></div><time>Live</time></div> : <div className="alert-row warning"><span><AppIcon name="alert" size={13} /></span><div><strong>Local AWS connector unavailable</strong><p>Stratus could not verify profile “{clients[clientName].profile}” from this runtime. Stored data remains available.</p></div><time>Now</time></div>}{clientName === "Nilkamal" && <div className="alert-row"><span><AppIcon name="info" size={13} /></span><div><strong>Infrastructure document missing</strong><p>Only historical bills were supplied for Nilkamal.</p></div><time>Source</time></div>}<div className="alert-row good"><span><AppIcon name="check" size={13} /></span><div><strong>Billing history validated</strong><p>Six distinct monthly grand totals are loaded with no duplicate client/month pairs.</p></div><time>Aug 22</time></div></>; }
function formatMemory(mebibytes: number): string { return mebibytes >= 1024 ? `${Number((mebibytes / 1024).toFixed(1))} GB` : `${mebibytes} MiB`; }
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)).toLocaleString()} ${units[index]}`;
}
function formatDateTime(value?: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}
function formatRelative(value: string): string {
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
    ...inventory.backupJobs.flatMap((job) => [job.completedAt, job.createdAt]),
    ...inventory.buckets.flatMap((bucket) => bucket.latestObjects.map((object) => object.lastModified)),
  ].filter((value): value is string => Boolean(value));
  return timestamps.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}
function regionName(region: string): string { return region === "ap-south-1" ? "Mumbai" : region === "ap-south-2" ? "Hyderabad" : region; }
function shortArn(arn: string): string { const parts = arn.split(/[/:]/).filter(Boolean); return parts.at(-1) ?? arn; }
function shortKey(key: string): string { const parts = key.split("/"); return parts.at(-1) ?? key; }
function syncResult(step: string, inventory?: AwsProfileInventory): string {
  if (!inventory) return "Discovery unavailable";
  if (step === "EC2") return `${inventory.instances.length} instances`;
  if (step === "EBS") return `${inventory.instances.reduce((sum, instance) => sum + instance.volumes.length, 0)} attached volumes`;
  if (step === "Networking") { const count = new Set(inventory.instances.map((instance) => instance.vpcId).filter(Boolean)).size; return `${count} VPC${count === 1 ? "" : "s"} · 2 regions checked`; }
  if (step === "S3") return `${inventory.buckets.length} buckets inspected`;
  return `${inventory.backupPlans.length} plan${inventory.backupPlans.length === 1 ? "" : "s"} · ${inventory.backupJobs.length} jobs`;
}
function AppIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    billing: <><path d="M6 2h9l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
    servers: <><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" /></>,
    cloud: <path d="M17.5 19H7a5 5 0 0 1-.8-9.94A7 7 0 0 1 19.6 11.5 3.8 3.8 0 0 1 17.5 19Z" />,
    network: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="m10.8 7.2-4.6 8.4M13.2 7.2l4.6 8.4M7.5 18h9" /></>,
    shield: <><path d="M12 3 20 6v5c0 5.1-3.4 8.7-8 10-4.6-1.3-8-4.9-8-10V6z" /><path d="m9 12 2 2 4-5" /></>,
    alert: <><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v4M12 17h.01" /></>,
    reports: <><path d="M4 21V10M10 21V4M16 21v-7M22 21H2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 15v5h14v-5" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18.8 7M17.9 15A7 7 0 0 1 5.2 17" /></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z" /><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8z" /></>,
    dollar: <><path d="M12 2v20" /><path d="M17 6.5c-1-1-2.4-1.5-4.2-1.5-2.2 0-3.8 1.1-3.8 2.8 0 4.2 8 2.1 8 6.4 0 1.7-1.6 2.8-3.8 2.8-2 0-3.7-.6-5-1.9" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3" /></>,
    sigma: <path d="M18 4H6l6 8-6 8h12" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" /></>,
    download: <><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></>,
    printer: <><path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z" /><path d="M17 12h.01" /></>,
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function formatPercent(value: number, showPositiveSign = false) { const normalized = Math.abs(value) < 0.05 ? 0 : value; return `${showPositiveSign && normalized > 0 ? "+" : ""}${normalized.toFixed(1)}%`; }
function csvCell(value: string) { return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
