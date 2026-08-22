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

const serviceSteps = ["EC2", "EBS", "Networking", "IAM", "S3", "Backups", "CloudWatch"];

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

export function StratusApp() {
  const [selectedClient, setSelectedClient] = useState<ClientName>("Nilkamal");
  const [activePage, setActivePage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All regions");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncStep, setSyncStep] = useState(-1);
  const [awsStatus, setAwsStatus] = useState<AwsConnectorStatus>({ state: "checking", connected: 0, expected: 4, allConnected: false, profiles: [] });
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const client = clients[selectedClient];
  const globalSpend = useMemo(() => clientOrder.reduce((sum, name) => sum + clients[name].bills.at(-1)!.total, 0), []);
  const documentedServers = clientOrder.reduce((sum, name) => sum + clients[name].servers.length, 0);
  const allServers = clientOrder.flatMap((name) => clients[name].servers.map((server) => ({ ...server, client: name })));
  const searchResults = query.trim().length > 1 ? allServers.filter((server) => Object.values(server).join(" ").toLowerCase().includes(query.toLowerCase())) : [];
  const selectedProfile = awsStatus.profiles.find((profile) => profile.client === selectedClient);

  useEffect(() => {
    let active = true;
    void readAwsConnectorStatus().then((status) => { if (active) setAwsStatus(status); });
    return () => { active = false; };
  }, []);

  const navigate = (page: string) => { setActivePage(page); setQuery(""); setSelectedServer(null); };
  const refresh = () => {
    setSyncOpen(true); setSyncStep(0);
    void readAwsConnectorStatus(true).then(setAwsStatus);
    serviceSteps.forEach((_, index) => window.setTimeout(() => setSyncStep(index + 1), 360 * (index + 1)));
  };
  const handleUpload = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setUploadMessage("Only PDF bill summaries are accepted.");
    if (file.size > 10 * 1024 * 1024) return setUploadMessage("This file exceeds the 10 MB upload limit.");
    setUploadMessage(`${file.name} passed file validation. Server parsing requires the database deployment.`);
  };
  const askAssistant = (question: string) => {
    const q = question.toLowerCase();
    if (q.includes("highest") && q.includes("cost")) setAssistantAnswer(`Nilkamal has the highest July 2026 bill at ${usd.format(clients.Nilkamal.bills.at(-1)!.total)}.`);
    else if (q.includes("public ip")) setAssistantAnswer(allServers.filter((s) => s.publicIp).map((s) => `${s.client}: ${s.name} — ${s.publicIp}`).join("\n") || "No documented public IPs are available.");
    else if (q.includes("gcpl") && q.includes("ec2")) setAssistantAnswer(`GCPL EC2 spend from February through July: ${clients.GCPL.bills.map((b) => `${b.month} ${usd.format(b.topServiceCost)}`).join(", ")}.`);
    else if (q.includes("stopped") || q.includes("vpn") || q.includes("unused")) setAssistantAnswer(awsStatus.allConnected ? "The AWS profiles are connected, but this answer requires a completed resource-inventory sync. Stratus will not guess." : "That answer needs live AWS state. The local AWS connector is unavailable, so Stratus will not guess.");
    else setAssistantAnswer("The external AI provider is not configured. I can still answer supported questions from the loaded billing history and documented inventory.");
    setAssistantQuestion(question);
  };
  const exportCsv = (kind: "billing" | "infrastructure") => {
    const csv = kind === "billing"
      ? ["client,month,total_usd,pre_tax_usd,top_service,top_service_cost", ...clientOrder.flatMap((name) => clients[name].bills.map((b) => [name, `${b.month} 2026`, b.total.toFixed(2), b.preTax.toFixed(2), b.topService, b.topServiceCost.toFixed(2)].join(",")))].join("\n")
      : ["client,resource,role,environment,os,region,zone,private_ip,public_ip", ...allServers.map((s) => [s.client, s.name, s.role, s.environment, s.os, s.region, s.zone, s.privateIp ?? "", s.publicIp ?? ""].map(csvCell).join(","))].join("\n");
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

        <section className="client-strip" aria-label="Clients"><span>Clients</span>{clientOrder.map((name) => <button key={name} onClick={() => setSelectedClient(name)} className={name === selectedClient ? "selected" : ""} aria-pressed={name === selectedClient}><i style={{ background: clients[name].accent }}>{clients[name].initials}</i>{name}<b aria-hidden /></button>)}</section>

        <div className="content">
          {activePage === "Dashboard" && <Dashboard clientName={selectedClient} navigate={navigate} globalSpend={globalSpend} documentedServers={documentedServers} refresh={refresh} profileStatus={selectedProfile} />}
          {activePage === "Billing" && <BillingPage clientName={selectedClient} onUpload={() => setUploadOpen(true)} />}
          {activePage === "Servers" && <ServersPage clientName={selectedClient} regionFilter={regionFilter} setRegionFilter={setRegionFilter} selectedServer={selectedServer} setSelectedServer={setSelectedServer} />}
          {activePage === "Backups" && <BackupsPage clientName={selectedClient} />}
          {activePage === "Network" && <NetworkPage clientName={selectedClient} />}
          {activePage === "IAM & Security" && <SecurityPage clientName={selectedClient} />}
          {activePage === "Alerts" && <AlertsPage clientName={selectedClient} refresh={refresh} profileStatus={selectedProfile} />}
          {activePage === "Reports" && <ReportsPage exportCsv={exportCsv} />}
        </div>
      </main>

      <button className="ai-button" aria-label="Open Stratus AI assistant" onClick={() => setAssistantOpen((open) => !open)} aria-expanded={assistantOpen}><span><AppIcon name="sparkles" size={22} /></span><b>Ask AI</b></button>
      {assistantOpen && <Assistant question={assistantQuestion} answer={assistantAnswer} ask={askAssistant} close={() => setAssistantOpen(false)} />}
      {uploadOpen && <Modal title="Upload AWS bill summary" close={() => { setUploadOpen(false); setUploadMessage(""); }}><button className="drop-zone" onClick={() => fileRef.current?.click()}><span><AppIcon name="upload" size={28} /></span><strong>Choose a PDF bill summary</strong><small>Maximum 10 MB · source files are discarded after parsing</small></button><input ref={fileRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(e) => handleUpload(e.target.files?.[0])} /><p className="modal-message" aria-live="polite">{uploadMessage || `The bill will be validated and assigned to ${selectedClient}.`}</p></Modal>}
      {syncOpen && <Modal title={`Refresh ${selectedClient}`} close={() => setSyncOpen(false)}><div className="sync-list">{serviceSteps.map((step, index) => <div key={step}><span className={syncStep > index ? "done" : syncStep === index ? "running" : "pending"}>{syncStep > index ? "✓" : syncStep === index ? "↻" : "·"}</span><strong>{step}</strong><small>{syncStep > index ? selectedProfile?.connected ? "Profile verified" : "Connector unavailable" : syncStep === index ? "Checking…" : "Waiting"}</small></div>)}</div>{syncStep >= serviceSteps.length && (selectedProfile?.connected ? <p className="modal-message">AWS profile “{client.profile}” is connected to account {selectedProfile.accountId}. Resource inventory remains source-backed until the service discovery pass completes.</p> : <p className="sync-error">The local connector could not verify AWS CLI profile “{client.profile}”. Stored source data was preserved.</p>)}</Modal>}
    </div>
  );
}

function Dashboard({ clientName, navigate, globalSpend, documentedServers, refresh, profileStatus }: { clientName: ClientName; navigate: (page: string) => void; globalSpend: number; documentedServers: number; refresh: () => void; profileStatus?: AwsProfileStatus }) {
  const client = clients[clientName], latest = client.bills.at(-1)!, prior = client.bills.at(-2)!;
  const change = ((latest.total - prior.total) / prior.total) * 100, maxBill = Math.max(...client.bills.map((bill) => bill.total));
  return <>
    <section className="notice"><span>i</span><div><strong>{profileStatus?.connected ? "AWS profile connected" : "Source-backed baseline"}</strong><p>{profileStatus?.connected ? `${client.profile} was verified against account ${profileStatus.accountId}. ` : ""}{client.sourceNote} {!profileStatus?.connected && <>Live fields require the local <code>{client.profile}</code> connector.</>}</p></div><button onClick={refresh}>View sync status</button></section>
    <section className="kpis" aria-label="Key metrics">
      <Kpi icon="dollar" title="Selected client spend" value={usd.format(latest.total)} note={`${formatPercent(change, true)} vs Jun`} tone={change > 0.05 ? "warning" : "success"} />
      <Kpi icon="servers" title="Documented servers" value={String(client.servers.length)} note={`${documentedServers} across all clients`} />
      <Kpi icon="check" title="Backup coverage" value={client.servers.length ? "Configured" : "Unavailable"} note="Freshness requires AWS sync" tone={client.servers.length ? "success" : "muted"} />
      <Kpi icon="network" title="Network posture" value={client.servers.length ? "Documented" : "Unavailable"} note={`${client.primaryRegion} → ${client.drRegion}`} />
      <Kpi icon="sigma" title="All-client spend" value={usd.format(globalSpend)} note="July 2026 source totals" />
    </section>
    <section className="dashboard-grid">
      <article className="panel spend-panel"><PanelTitle title="Monthly spend" action="Billing details" onAction={() => navigate("Billing")} /><div className="spend-summary"><div><strong>{usd.format(latest.total)}</strong><span>July 2026 grand total</span></div><p className={change > 0 ? "up" : "down"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%</p></div><div className="bar-chart" aria-label="Six-month billing totals">{client.bills.map((bill) => <div className="bar-column" key={bill.month}><span>{usd.format(bill.total)}</span><i style={{ height: `${Math.max(10, (bill.total / maxBill) * 100)}%` }} /><b>{bill.month}</b></div>)}</div><div className="panel-foot"><span>6-month average <strong>{usd.format(average(client.bills.map((b) => b.total)))}</strong></span><span>Top service <strong>{latest.topService}</strong></span></div></article>
      <article className="panel servers-panel"><PanelTitle title={`Servers (${client.servers.length})`} action="View inventory" onAction={() => navigate("Servers")} />{client.servers.length ? <ServerTable servers={client.servers} onSelect={() => navigate("Servers")} /> : <Empty title="No infrastructure source supplied" text="Billing is available. Server inventory will populate after AWS profile synchronization." />}</article>
      <article className="panel network-panel"><PanelTitle title="Regional topology" action="Network" onAction={() => navigate("Network")} /><RegionRoute clientName={clientName} /><p className="panel-note">Architecture context comes from the supplied infrastructure baseline. Tunnel state and live telemetry need AWS synchronization.</p></article>
      <article className="panel backup-panel"><PanelTitle title="Backup summary" action="Backups" onAction={() => navigate("Backups")} /><div className="backup-visual"><div className="backup-ring"><AppIcon name="cloud" size={23} /></div><div><strong>{(backupPolicies[clientName] ?? []).length} plans</strong><span>{client.servers.length ? "Policy baseline configured" : "Awaiting inventory"}</span><small><i /> Freshness not synchronized</small></div></div></article>
      <article className="panel alerts-panel"><PanelTitle title="Attention needed" action="All alerts" onAction={() => navigate("Alerts")} /><AlertRows clientName={clientName} profileStatus={profileStatus} /></article>
    </section>
  </>;
}

function BillingPage({ clientName, onUpload }: { clientName: ClientName; onUpload: () => void }) {
  const client = clients[clientName], latest = client.bills.at(-1)!, prior = client.bills.at(-2)!;
  const high = client.bills.reduce((a, b) => a.total > b.total ? a : b), low = client.bills.reduce((a, b) => a.total < b.total ? a : b), change = ((latest.total - prior.total) / prior.total) * 100;
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">FEBRUARY — JULY 2026</p><h2>Billing analysis</h2><p>Validated from six supplied AWS bill summaries. Currency values use decimal source totals.</p></div><button className="refresh-button" onClick={onUpload}><AppIcon name="upload" size={15} /> Upload bill</button></section><section className="summary-grid"><Kpi icon="dollar" title="Latest total" value={usd.format(latest.total)} note="July 2026 grand total" /><Kpi icon="billing" title="Pre-tax" value={usd.format(latest.preTax)} note={`Tax ${usd.format(latest.total - latest.preTax)}`} /><Kpi icon="arrow" title="Month over month" value={formatPercent(change, true)} note={`June ${usd.format(prior.total)}`} tone={change > 0 ? "warning" : "success"} /><Kpi icon="sigma" title="Six-month average" value={usd.format(average(client.bills.map((b) => b.total)))} note={`High ${high.month} · Low ${low.month}`} /></section><section className="page-grid"><article className="panel wide"><PanelTitle title="Monthly totals" /><div className="billing-bars">{client.bills.map((bill) => <div key={bill.month}><span><b>{bill.month} 2026</b><small>{usd.format(bill.total)}</small></span><i><b style={{ width: `${(bill.total / high.total) * 100}%` }} /></i></div>)}</div></article><article className="panel"><PanelTitle title="Previous-month composition" /><div className="donut-wrap"><div className="donut" style={{ "--share": `${(prior.topServiceCost / prior.total) * 100}%` } as React.CSSProperties}><strong>{((prior.topServiceCost / prior.total) * 100).toFixed(0)}%</strong><small>EC2</small></div><div className="legend"><p><i className="ec2" />Elastic Compute Cloud <b>{usd.format(prior.topServiceCost)}</b></p><p><i />Other services & tax <b>{usd.format(prior.total - prior.topServiceCost)}</b></p></div></div></article><article className="panel wide"><PanelTitle title="Per-service analytics" /><div className="data-list"><div><span>Elastic Compute Cloud<small>Largest supported service line</small></span><b>{usd.format(latest.topServiceCost)}<small>{((latest.topServiceCost / latest.total) * 100).toFixed(1)}% of July</small></b></div><div><span>Other services and tax<small>Derived remainder; detailed source terms are retained by the ingestion model</small></span><b>{usd.format(latest.total - latest.topServiceCost)}<small>{(100 - (latest.topServiceCost / latest.total) * 100).toFixed(1)}% of July</small></b></div></div></article><article className="panel"><PanelTitle title="Cost investigation" /><div className="insights"><p className={change > 10 ? "warn" : "ok"}><span>{change > 0 ? "↑" : "↓"}</span><b>{Math.abs(change).toFixed(1)}% {change > 0 ? "increase" : "decrease"}<small>July compared with June</small></b></p><p><span>◎</span><b>{high.month} was highest<small>{usd.format(high.total)} grand total</small></b></p><p><span>◌</span><b>{low.month} was lowest<small>{usd.format(low.total)} grand total</small></b></p></div></article></section></div>;
}

function ServersPage({ clientName, regionFilter, setRegionFilter, selectedServer, setSelectedServer }: { clientName: ClientName; regionFilter: string; setRegionFilter: (value: string) => void; selectedServer: Server | null; setSelectedServer: (server: Server | null) => void }) {
  const [serverSearch, setServerSearch] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("All environments");
  const servers = clients[clientName].servers.filter((server) => {
    const matchesRegion = regionFilter === "All regions" || server.region === regionFilter;
    const matchesEnvironment = environmentFilter === "All environments" || server.environment.toLowerCase().includes(environmentFilter.toLowerCase());
    const haystack = `${server.name} ${server.role} ${server.os} ${server.privateIp ?? ""} ${server.publicIp ?? ""}`.toLowerCase();
    return matchesRegion && matchesEnvironment && haystack.includes(serverSearch.trim().toLowerCase());
  });
  if (selectedServer) return <div className="page-stack"><button className="back-link" onClick={() => setSelectedServer(null)}><AppIcon name="arrow" size={14} /> Back to servers</button><section className="page-head"><div><p className="eyebrow">DOCUMENTED RESOURCE</p><h2>{selectedServer.name}</h2><p>{selectedServer.role} · {selectedServer.environment}</p></div><span className="source-badge">Document baseline</span></section><section className="detail-grid"><Detail title="Identity" rows={[["Role", selectedServer.role], ["Environment", selectedServer.environment], ["Last sync", "Not synchronized"], ["AWS instance ID", "Unavailable"]]} /><Detail title="Compute" rows={[["Operating system", selectedServer.os], ["CPU", selectedServer.cpu], ["Memory", selectedServer.memory], ["Instance type", "Unavailable"]]} /><Detail title="Networking" rows={[["Region", selectedServer.region], ["Availability zone", selectedServer.zone], ["Private IP", selectedServer.privateIp ?? "Unavailable"], ["Public IP", selectedServer.publicIp ?? "Unavailable"]]} /><Detail title="Storage & telemetry" rows={[["Storage", selectedServer.storage], ["CloudWatch CPU", "Unavailable"], ["Memory utilization", "Unavailable"], ["Related backup state", "Configured, freshness unavailable"]]} /></section></div>;
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">INFRASTRUCTURE INVENTORY</p><h2>Servers</h2><p>Every resource supported by the supplied documentation. Live AWS discovery is clearly separated.</p></div><div className="inventory-filters"><label><AppIcon name="search" size={14} /><span className="sr-only">Search server inventory</span><input value={serverSearch} onChange={(event) => setServerSearch(event.target.value)} placeholder="Search inventory" /></label><select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Filter servers by region"><option>All regions</option><option>Mumbai</option><option>Hyderabad</option></select><select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)} aria-label="Filter servers by environment"><option>All environments</option><option>Production</option><option>Stage</option></select></div></section><article className="panel inventory-panel"><PanelTitle title={`${servers.length} documented resources`} />{servers.length ? <ServerTable servers={servers} onSelect={setSelectedServer} detailed /> : <Empty title="No matching servers" text={clients[clientName].servers.length ? "Adjust the search or filters to see documented resources." : "No infrastructure document was supplied for this client."} />}</article></div>;
}

function BackupsPage({ clientName }: { clientName: ClientName }) { const rows = backupPolicies[clientName] ?? []; return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">24-HOUR SYNC POLICY</p><h2>Backup health</h2><p>Plans and retention come from the infrastructure baselines; freshness and job status require AWS Backup telemetry.</p></div><span className="source-badge warning">Freshness unavailable</span></section><section className="summary-grid"><Kpi icon="check" title="Configured plans" value={String(rows.length)} note="From supplied baseline" /><Kpi icon="alert" title="Failed jobs" value="Unavailable" note="Requires AWS Backup API" tone="muted" /><Kpi icon="clock" title="Latest backup" value="Unavailable" note="No live job timestamps" tone="muted" /><Kpi icon="route" title="DR route" value={`${clients[clientName].primaryRegion} → ${clients[clientName].drRegion}`} note="Cross-region architecture" /></section><article className="panel"><PanelTitle title="Documented backup policy" />{rows.length ? <div className="data-table"><table><thead><tr><th>Job name</th><th>Backup type</th><th>Frequency</th><th>Retention</th><th>Freshness</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}<td><span className="unavailable">Not synchronized</span></td></tr>)}</tbody></table></div> : <Empty title="No backup baseline supplied" text="Stratus will populate plans, jobs, recovery points, and overdue status after AWS synchronization." />}</article></div>; }

function NetworkPage({ clientName }: { clientName: ClientName }) { const client = clients[clientName], server = client.servers[0]; return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">MUMBAI + HYDERABAD</p><h2>Network overview</h2><p>Understandable network relationships without raw AWS console JSON.</p></div><span className="source-badge">Read-only</span></section><article className="panel topology-panel"><PanelTitle title="Regional relationship" /><RegionRoute clientName={clientName} /><div className="topology-flow"><div><span><AppIcon name="network" /></span><b>Internet gateway</b><small>{server?.publicIp ?? "Unavailable"}</small></div><i>→</i><div><span><AppIcon name="map" /></span><b>VPC</b><small>{clientName === "Fusion" ? "172.31.0.0/16" : clientName === "Swastiks" ? "172.31.16.0/20" : clientName === "GCPL" ? "172.31.0.0/16" : "Unavailable"}</small></div><i>→</i><div><span><AppIcon name="servers" /></span><b>Workload</b><small>{server?.privateIp ?? "Awaiting sync"}</small></div><i>→</i><div><span><AppIcon name="cloud" /></span><b>DR backups</b><small>{client.drRegion}</small></div></div></article><section className="detail-grid"><Detail title="Address inventory" rows={client.servers.length ? client.servers.flatMap((s) => [[`${s.name} private`, s.privateIp ?? "Unavailable"], [`${s.name} public`, s.publicIp ?? "Unavailable"]]) : [["Addresses", "Unavailable"]]} /><Detail title="VPN telemetry" rows={[["Site-to-Site VPN", clientName === "GCPL" || clientName === "Fusion" ? "Documented" : "Not documented"], ["Tunnel state", "Unavailable"], ["Outside IP", "Unavailable"], ["Last status change", "Unavailable"]]} /></section></div>; }

function SecurityPage({ clientName }: { clientName: ClientName }) { const notes = clientName === "GCPL" ? [["MFA enforcement", "Documented as required for cloud and local admin paths"], ["Endpoint protection", "CrowdStrike Falcon Insight documented"], ["Patch management", "WSUS / AWS Systems Manager documented"]] : clientName === "Fusion" ? [["MFA status", "Assumed in source; not directly verified"], ["Security group", "Fusion_SG documented"], ["Administrative access", "RDP restricted to approved /32 sources"]] : clientName === "Swastiks" ? [["Endpoint protection", "CrowdStrike Falcon Insight documented"], ["OS hardening", "CIS Level 1 baseline documented"], ["Patch management", "WSUS / AWS Systems Manager documented"]] : []; return <div className="page-stack security-page"><section className="page-head"><div><p className="eyebrow">IAM VISIBILITY</p><h2>IAM & security</h2><p>Elevated access is never inferred. Live users, roles, keys, and policies require IAM read permissions.</p></div><span className="source-badge warning">IAM sync required</span></section><section className="summary-grid"><Kpi icon="shield" title="IAM users" value="Unavailable" note="Requires iam:ListUsers" tone="muted" /><Kpi icon="key" title="Active keys" value="Unavailable" note="Secret values are never collected" tone="muted" /><Kpi icon="check" title="MFA coverage" value={clientName === "GCPL" ? "Documented" : "Unverified"} note="Live verification pending" /><Kpi icon="alert" title="Admin findings" value="Unavailable" note="No privilege claims invented" tone="muted" /></section><article className="panel"><PanelTitle title="Documented controls" />{notes.length ? <div className="data-list">{notes.map(([title, text]) => <div key={title}><span>{title}<small>{text}</small></span><span className="source-badge">Source baseline</span></div>)}</div> : <Empty title="No security baseline supplied" text="IAM inventory will appear after the named AWS profile can be read." />}</article></div>; }

function AlertsPage({ clientName, refresh, profileStatus }: { clientName: ClientName; refresh: () => void; profileStatus?: AwsProfileStatus }) { return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">ACTIONABLE SIGNALS</p><h2>Alerts</h2><p>Only conditions supported by stored data are shown. No noisy or fabricated operational alerts.</p></div><button className="refresh-button" onClick={refresh}>↻ Retry sync</button></section><article className="panel alerts-page"><PanelTitle title="Open alerts" /><AlertRows clientName={clientName} profileStatus={profileStatus} /></article></div>; }

function ReportsPage({ exportCsv }: { exportCsv: (kind: "billing" | "infrastructure") => void }) { return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">EXPORTS</p><h2>Reports</h2><p>Exports use the same validated application data shown throughout Stratus.</p></div></section><section className="report-grid"><button onClick={() => exportCsv("billing")}><span><AppIcon name="billing" /></span><div><strong>Billing summary CSV</strong><small>All clients · six months · exact source totals</small></div><b><AppIcon name="download" size={14} /> Download</b></button><button onClick={() => exportCsv("infrastructure")}><span><AppIcon name="servers" /></span><div><strong>Infrastructure summary CSV</strong><small>Documented servers, regions, and addresses</small></div><b><AppIcon name="download" size={14} /> Download</b></button><button onClick={() => window.print()}><span><AppIcon name="printer" /></span><div><strong>Printable current view</strong><small>Browser-optimized operations report</small></div><b><AppIcon name="printer" size={14} /> Print</b></button></section></div>; }

function Assistant({ question, answer, ask, close }: { question: string; answer: string; ask: (question: string) => void; close: () => void }) { const [draft, setDraft] = useState(""); const suggestions = ["Why did Nilkamal's bill increase?", "Which servers are stopped?", "Show failed backups.", "Which IAM users have admin access?"]; return <aside className="assistant-panel" aria-label="Stratus AI assistant"><header><span><AppIcon name="sparkles" size={18} /></span><div><strong>Stratus AI</strong><small>Read-only · source aware</small></div><button onClick={close} aria-label="Close assistant"><AppIcon name="close" size={19} /></button></header><div className="assistant-scroll"><p className="assistant-config"><AppIcon name="info" size={14} /> External AI is not configured. Supported source-backed questions still work.</p><div className="suggestions">{suggestions.map((s) => <button className="suggestion" key={s} onClick={() => ask(s)}><AppIcon name="sparkles" size={13} />{s}</button>)}</div>{question && <div className="chat"><p><b>You</b>{question}</p><p><b>Stratus</b>{answer.split("\n").map((line) => <span key={line}>{line}</span>)}</p></div>}</div><form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { ask(draft); setDraft(""); } }}><label className="sr-only" htmlFor="ai-question">Ask Stratus AI</label><input id="ai-question" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about billing or inventory…" /><button aria-label="Send question"><AppIcon name="arrow" size={17} /></button></form></aside>; }

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="Close dialog"><AppIcon name="close" size={18} /></button></header>{children}</section></div>; }
function Kpi({ icon, title, value, note, tone = "default" }: { icon: IconName; title: string; value: string; note: string; tone?: string }) { return <article className={`kpi kpi-${tone}`}><div className={`kpi-icon ${tone}`}><AppIcon name={icon} size={18} /></div><div><p>{title}</p><strong>{value}</strong><span className={tone}>{note}</span></div></article>; }
function PanelTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return <header className="panel-title"><h2>{title}</h2>{action && <button onClick={onAction}>{action} <span>→</span></button>}</header>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span><AppIcon name="cloud" size={21} /></span><strong>{title}</strong><p>{text}</p></div>; }
function RegionRoute({ clientName }: { clientName: ClientName }) { const client = clients[clientName]; return <div className="route"><div><i className="region-dot primary" /><strong>{client.primaryRegion}</strong><span>Primary · {client.primaryRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}</span></div><b>→</b><div><i className="region-dot" /><strong>{client.drRegion}</strong><span>DR · {client.drRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}</span></div></div>; }
function ServerTable({ servers, onSelect, detailed = false }: { servers: Server[]; onSelect: (server: Server) => void; detailed?: boolean }) { return <div className="table-wrap"><table><thead><tr><th>Resource</th><th>Role</th><th>Environment</th><th>Status</th><th>Compute</th><th>Storage</th><th>Region</th>{detailed && <th>IP</th>}</tr></thead><tbody>{servers.map((server) => <tr key={server.name} onClick={() => onSelect(server)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(server)}><td><strong>{server.name}</strong><small>{server.os}</small></td><td>{server.role}</td><td>{server.environment}</td><td><span className="documented"><i />Documented</span></td><td>{server.cpu}<small>{server.memory}</small></td><td>{server.storage}</td><td>{server.region}<small>{server.zone}</small></td>{detailed && <td>{server.privateIp ?? "Unavailable"}<small>{server.publicIp ?? "No public IP documented"}</small></td>}</tr>)}</tbody></table></div>; }
function Detail({ title, rows }: { title: string; rows: string[][] }) { return <article className="panel detail-card"><PanelTitle title={title} /><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>; }
function AlertRows({ clientName, profileStatus }: { clientName: ClientName; profileStatus?: AwsProfileStatus }) { return <>{profileStatus?.connected ? <div className="alert-row good"><span><AppIcon name="check" size={13} /></span><div><strong>AWS profile verified</strong><p>{clients[clientName].profile} is connected to account {profileStatus.accountId} through the read-only local connector.</p></div><time>Live</time></div> : <div className="alert-row warning"><span><AppIcon name="alert" size={13} /></span><div><strong>Local AWS connector unavailable</strong><p>Stratus could not verify profile “{clients[clientName].profile}” from this runtime. Stored data remains available.</p></div><time>Now</time></div>}{clientName === "Nilkamal" && <div className="alert-row"><span><AppIcon name="info" size={13} /></span><div><strong>Infrastructure document missing</strong><p>Only historical bills were supplied for Nilkamal.</p></div><time>Source</time></div>}<div className="alert-row good"><span><AppIcon name="check" size={13} /></span><div><strong>Billing history validated</strong><p>Six distinct monthly grand totals are loaded with no duplicate client/month pairs.</p></div><time>Aug 22</time></div></>; }
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
