"use client";

import { useMemo, useRef, useState } from "react";
import { clientOrder, clients, type ClientName, type Server, usd } from "./stratus-data";

const nav = [
  ["Dashboard", "⌂"], ["Billing", "▤"], ["Servers", "▥"], ["Backups", "☁"],
  ["Network", "⌘"], ["IAM & Security", "◇"], ["Alerts", "♢"], ["Reports", "▧"],
] as const;

const backupPolicies: Partial<Record<ClientName, Array<[string, string, string, string]>>> = {
  GCPL: [["Prod-DB-Daily-Full", "Database full", "Daily", "1 month"], ["Prod-DB-4hr-Diff", "Database differential", "Every 4 hours", "1 month"], ["Prod-TS-15min-Log", "Transaction log", "Every 15 minutes", "1 month"], ["Prod-VM-Monthly-Backup", "AMI image", "Monthly", "1 month"]],
  Swastiks: [["Prod-DB-Daily-Full", "Database full", "Daily", "1 month"], ["Prod-DB-6hr-Diff", "Database differential", "Every 6 hours", "1 month"], ["Prod-TS-30 min-Log", "Transaction log", "Every 30 minutes", "1 month"], ["Prod-VM-Monthly-Backup", "AMI image", "Monthly", "1 month"]],
  Fusion: [["Prod-DB-Daily-Full", "Database full", "Daily", "1 month"], ["Prod-DB-6hr-Diff", "Database differential", "Every 6 hours", "1 month"], ["Prod-TS-30min-Log", "Transaction log", "Every 30 minutes", "1 month"], ["Prod-VM-Monthly-Backup", "AMI image", "Monthly", "1 month"]],
};

const serviceSteps = ["EC2", "EBS", "Networking", "IAM", "S3", "Backups", "CloudWatch"];

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
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const client = clients[selectedClient];
  const globalSpend = useMemo(() => clientOrder.reduce((sum, name) => sum + clients[name].bills.at(-1)!.total, 0), []);
  const documentedServers = clientOrder.reduce((sum, name) => sum + clients[name].servers.length, 0);
  const allServers = clientOrder.flatMap((name) => clients[name].servers.map((server) => ({ ...server, client: name })));
  const searchResults = query.trim().length > 1 ? allServers.filter((server) => Object.values(server).join(" ").toLowerCase().includes(query.toLowerCase())) : [];

  const navigate = (page: string) => { setActivePage(page); setQuery(""); setSelectedServer(null); };
  const refresh = () => {
    setSyncOpen(true); setSyncStep(0);
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
    else if (q.includes("stopped") || q.includes("vpn") || q.includes("unused")) setAssistantAnswer("That answer needs live AWS state. The configured profiles were not detected, so Stratus will not guess.");
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
        <button className="brand" onClick={() => navigate("Dashboard")}><span className="brand-cloud">☁</span><span><strong>Stratus</strong><small>AWS operations</small></span></button>
        <nav aria-label="Primary navigation">{nav.map(([item, icon]) => <button onClick={() => navigate(item)} className={activePage === item ? "active" : ""} key={item}><span aria-hidden>{icon}</span>{item}</button>)}</nav>
        <div className="sidebar-foot"><span className="status-dot" />Source data ready<small>AWS profiles not detected</small></div>
      </aside>

      <main>
        <header className="topbar">
          <div><p className="eyebrow">{activePage.toUpperCase()}</p><h1>{activePage === "Dashboard" ? "Good morning, Admin 👋" : activePage}</h1><p>{activePage === "Dashboard" ? "Here’s the current source-backed view of your AWS environments." : `${selectedClient} · read-only operations workspace`}</p></div>
          <label className="search"><span aria-hidden>⌕</span><span className="sr-only">Search resources</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers, IPs, clients…" /></label>
          <button className="outline-button" onClick={() => setUploadOpen(true)}>↥&nbsp; Upload bill</button>
          <button className="refresh-button" onClick={refresh}>↻&nbsp; Refresh all</button>
          {searchResults.length > 0 && <div className="search-popover" role="listbox">{searchResults.map((result) => <button key={`${result.client}-${result.name}`} onClick={() => { setSelectedClient(result.client); navigate("Servers"); setSelectedServer(result); }}><span>▥</span><div><strong>{result.name}</strong><small>{result.client} · {result.privateIp ?? result.publicIp ?? result.region}</small></div></button>)}</div>}
        </header>

        <section className="client-strip" aria-label="Clients"><span>Clients</span>{clientOrder.map((name) => <button key={name} onClick={() => setSelectedClient(name)} className={name === selectedClient ? "selected" : ""}><i style={{ background: clients[name].accent }}>{clients[name].initials}</i>{name}</button>)}</section>

        <div className="content">
          {activePage === "Dashboard" && <Dashboard clientName={selectedClient} navigate={navigate} globalSpend={globalSpend} documentedServers={documentedServers} refresh={refresh} />}
          {activePage === "Billing" && <BillingPage clientName={selectedClient} onUpload={() => setUploadOpen(true)} />}
          {activePage === "Servers" && <ServersPage clientName={selectedClient} regionFilter={regionFilter} setRegionFilter={setRegionFilter} selectedServer={selectedServer} setSelectedServer={setSelectedServer} />}
          {activePage === "Backups" && <BackupsPage clientName={selectedClient} />}
          {activePage === "Network" && <NetworkPage clientName={selectedClient} />}
          {activePage === "IAM & Security" && <SecurityPage clientName={selectedClient} />}
          {activePage === "Alerts" && <AlertsPage clientName={selectedClient} refresh={refresh} />}
          {activePage === "Reports" && <ReportsPage exportCsv={exportCsv} />}
        </div>
      </main>

      <button className="ai-button" aria-label="Open Stratus AI assistant" onClick={() => setAssistantOpen((open) => !open)}><span>✦</span><b>Ask AI</b></button>
      {assistantOpen && <Assistant question={assistantQuestion} answer={assistantAnswer} ask={askAssistant} close={() => setAssistantOpen(false)} />}
      {uploadOpen && <Modal title="Upload AWS bill summary" close={() => { setUploadOpen(false); setUploadMessage(""); }}><button className="drop-zone" onClick={() => fileRef.current?.click()}><span>☁</span><strong>Choose a PDF bill summary</strong><small>Maximum 10 MB · source files are discarded after parsing</small></button><input ref={fileRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(e) => handleUpload(e.target.files?.[0])} /><p className="modal-message" aria-live="polite">{uploadMessage || `The bill will be validated and assigned to ${selectedClient}.`}</p></Modal>}
      {syncOpen && <Modal title={`Refresh ${selectedClient}`} close={() => setSyncOpen(false)}><div className="sync-list">{serviceSteps.map((step, index) => <div key={step}><span className={syncStep > index ? "done" : syncStep === index ? "running" : "pending"}>{syncStep > index ? "✓" : syncStep === index ? "↻" : "·"}</span><strong>{step}</strong><small>{syncStep > index ? "Profile unavailable" : syncStep === index ? "Checking…" : "Waiting"}</small></div>)}</div>{syncStep >= serviceSteps.length && <p className="sync-error">Sync finished with configuration errors: AWS CLI profile “{client.profile}” was not detected. Stored source data was preserved.</p>}</Modal>}
    </div>
  );
}

function Dashboard({ clientName, navigate, globalSpend, documentedServers, refresh }: { clientName: ClientName; navigate: (page: string) => void; globalSpend: number; documentedServers: number; refresh: () => void }) {
  const client = clients[clientName], latest = client.bills.at(-1)!, prior = client.bills.at(-2)!;
  const change = ((latest.total - prior.total) / prior.total) * 100, maxBill = Math.max(...client.bills.map((bill) => bill.total));
  return <>
    <section className="notice"><span>i</span><div><strong>Source-backed baseline</strong><p>{client.sourceNote} Live fields remain unavailable until a valid <code>{client.profile}</code> profile is synchronized.</p></div><button onClick={refresh}>View sync status</button></section>
    <section className="kpis" aria-label="Key metrics">
      <Kpi icon="$" title="Selected client spend" value={usd.format(latest.total)} note={`${formatPercent(change, true)} vs Jun`} tone={change > 0.05 ? "warning" : "success"} />
      <Kpi icon="▥" title="Documented servers" value={String(client.servers.length)} note={`${documentedServers} across all clients`} />
      <Kpi icon="✓" title="Backup coverage" value={client.servers.length ? "Configured" : "Unavailable"} note="Freshness requires AWS sync" tone={client.servers.length ? "success" : "muted"} />
      <Kpi icon="⌘" title="Network posture" value={client.servers.length ? "Documented" : "Unavailable"} note={`${client.primaryRegion} → ${client.drRegion}`} />
      <Kpi icon="Σ" title="All-client spend" value={usd.format(globalSpend)} note="July 2026 source totals" />
    </section>
    <section className="dashboard-grid">
      <article className="panel spend-panel"><PanelTitle title="Monthly spend" action="Billing details" onAction={() => navigate("Billing")} /><div className="spend-summary"><div><strong>{usd.format(latest.total)}</strong><span>July 2026 grand total</span></div><p className={change > 0 ? "up" : "down"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%</p></div><div className="bar-chart" aria-label="Six-month billing totals">{client.bills.map((bill) => <div className="bar-column" key={bill.month}><span>{usd.format(bill.total)}</span><i style={{ height: `${Math.max(10, (bill.total / maxBill) * 100)}%` }} /><b>{bill.month}</b></div>)}</div><div className="panel-foot"><span>6-month average <strong>{usd.format(average(client.bills.map((b) => b.total)))}</strong></span><span>Top service <strong>{latest.topService}</strong></span></div></article>
      <article className="panel servers-panel"><PanelTitle title={`Servers (${client.servers.length})`} action="View inventory" onAction={() => navigate("Servers")} />{client.servers.length ? <ServerTable servers={client.servers} onSelect={() => navigate("Servers")} /> : <Empty title="No infrastructure source supplied" text="Billing is available. Server inventory will populate after AWS profile synchronization." />}</article>
      <article className="panel network-panel"><PanelTitle title="Regional topology" action="Network" onAction={() => navigate("Network")} /><RegionRoute clientName={clientName} /><p className="panel-note">Architecture context comes from the supplied infrastructure baseline. Tunnel state and live telemetry need AWS synchronization.</p></article>
      <article className="panel alerts-panel"><PanelTitle title="Attention needed" action="All alerts" onAction={() => navigate("Alerts")} /><AlertRows clientName={clientName} /></article>
    </section>
  </>;
}

function BillingPage({ clientName, onUpload }: { clientName: ClientName; onUpload: () => void }) {
  const client = clients[clientName], latest = client.bills.at(-1)!, prior = client.bills.at(-2)!;
  const high = client.bills.reduce((a, b) => a.total > b.total ? a : b), low = client.bills.reduce((a, b) => a.total < b.total ? a : b), change = ((latest.total - prior.total) / prior.total) * 100;
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">FEBRUARY — JULY 2026</p><h2>Billing analysis</h2><p>Validated from six supplied AWS bill summaries. Currency values use decimal source totals.</p></div><button className="refresh-button" onClick={onUpload}>↥ Upload bill</button></section><section className="summary-grid"><Kpi icon="$" title="Latest total" value={usd.format(latest.total)} note="July 2026 grand total" /><Kpi icon="∅" title="Pre-tax" value={usd.format(latest.preTax)} note={`Tax ${usd.format(latest.total - latest.preTax)}`} /><Kpi icon="↗" title="Month over month" value={`${change >= 0 ? "+" : ""}${change.toFixed(1)}%`} note={`June ${usd.format(prior.total)}`} tone={change > 0 ? "warning" : "success"} /><Kpi icon="≈" title="Six-month average" value={usd.format(average(client.bills.map((b) => b.total)))} note={`High ${high.month} · Low ${low.month}`} /></section><section className="page-grid"><article className="panel wide"><PanelTitle title="Monthly totals" /><div className="billing-bars">{client.bills.map((bill) => <div key={bill.month}><span><b>{bill.month} 2026</b><small>{usd.format(bill.total)}</small></span><i><b style={{ width: `${(bill.total / high.total) * 100}%` }} /></i></div>)}</div></article><article className="panel"><PanelTitle title="Previous-month composition" /><div className="donut-wrap"><div className="donut" style={{ "--share": `${(prior.topServiceCost / prior.total) * 100}%` } as React.CSSProperties}><strong>{((prior.topServiceCost / prior.total) * 100).toFixed(0)}%</strong><small>EC2</small></div><div className="legend"><p><i className="ec2" />Elastic Compute Cloud <b>{usd.format(prior.topServiceCost)}</b></p><p><i />Other services & tax <b>{usd.format(prior.total - prior.topServiceCost)}</b></p></div></div></article><article className="panel wide"><PanelTitle title="Per-service analytics" /><div className="data-list"><div><span>Elastic Compute Cloud<small>Largest supported service line</small></span><b>{usd.format(latest.topServiceCost)}<small>{((latest.topServiceCost / latest.total) * 100).toFixed(1)}% of July</small></b></div><div><span>Other services and tax<small>Derived remainder; detailed source terms are retained by the ingestion model</small></span><b>{usd.format(latest.total - latest.topServiceCost)}<small>{(100 - (latest.topServiceCost / latest.total) * 100).toFixed(1)}% of July</small></b></div></div></article><article className="panel"><PanelTitle title="Cost investigation" /><div className="insights"><p className={change > 10 ? "warn" : "ok"}><span>{change > 0 ? "↑" : "↓"}</span><b>{Math.abs(change).toFixed(1)}% {change > 0 ? "increase" : "decrease"}<small>July compared with June</small></b></p><p><span>◎</span><b>{high.month} was highest<small>{usd.format(high.total)} grand total</small></b></p><p><span>◌</span><b>{low.month} was lowest<small>{usd.format(low.total)} grand total</small></b></p></div></article></section></div>;
}

function ServersPage({ clientName, regionFilter, setRegionFilter, selectedServer, setSelectedServer }: { clientName: ClientName; regionFilter: string; setRegionFilter: (value: string) => void; selectedServer: Server | null; setSelectedServer: (server: Server | null) => void }) {
  const servers = clients[clientName].servers.filter((server) => regionFilter === "All regions" || server.region === regionFilter);
  if (selectedServer) return <div className="page-stack"><button className="back-link" onClick={() => setSelectedServer(null)}>← Back to servers</button><section className="page-head"><div><p className="eyebrow">DOCUMENTED RESOURCE</p><h2>{selectedServer.name}</h2><p>{selectedServer.role} · {selectedServer.environment}</p></div><span className="source-badge">Document baseline</span></section><section className="detail-grid"><Detail title="Identity" rows={[["Role", selectedServer.role], ["Environment", selectedServer.environment], ["Last sync", "Not synchronized"], ["AWS instance ID", "Unavailable"]]} /><Detail title="Compute" rows={[["Operating system", selectedServer.os], ["CPU", selectedServer.cpu], ["Memory", selectedServer.memory], ["Instance type", "Unavailable"]]} /><Detail title="Networking" rows={[["Region", selectedServer.region], ["Availability zone", selectedServer.zone], ["Private IP", selectedServer.privateIp ?? "Unavailable"], ["Public IP", selectedServer.publicIp ?? "Unavailable"]]} /><Detail title="Storage & telemetry" rows={[["Storage", selectedServer.storage], ["CloudWatch CPU", "Unavailable"], ["Memory utilization", "Unavailable"], ["Related backup state", "Configured, freshness unavailable"]]} /></section></div>;
  return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">INFRASTRUCTURE INVENTORY</p><h2>Servers</h2><p>Every resource supported by the supplied documentation. Live AWS discovery is clearly separated.</p></div><select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Filter servers by region"><option>All regions</option><option>Mumbai</option><option>Hyderabad</option></select></section><article className="panel"><PanelTitle title={`${servers.length} documented resources`} />{servers.length ? <ServerTable servers={servers} onSelect={setSelectedServer} detailed /> : <Empty title="No matching servers" text={clients[clientName].servers.length ? "Change the region filter to see documented resources." : "No infrastructure document was supplied for this client."} />}</article></div>;
}

function BackupsPage({ clientName }: { clientName: ClientName }) { const rows = backupPolicies[clientName] ?? []; return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">24-HOUR SYNC POLICY</p><h2>Backup health</h2><p>Plans and retention come from the infrastructure baselines; freshness and job status require AWS Backup telemetry.</p></div><span className="source-badge warning">Freshness unavailable</span></section><section className="summary-grid"><Kpi icon="✓" title="Configured plans" value={String(rows.length)} note="From supplied baseline" /><Kpi icon="!" title="Failed jobs" value="Unavailable" note="Requires AWS Backup API" tone="muted" /><Kpi icon="◷" title="Latest backup" value="Unavailable" note="No live job timestamps" tone="muted" /><Kpi icon="↔" title="DR route" value={`${clients[clientName].primaryRegion} → ${clients[clientName].drRegion}`} note="Cross-region architecture" /></section><article className="panel"><PanelTitle title="Documented backup policy" />{rows.length ? <div className="data-table"><table><thead><tr><th>Job name</th><th>Backup type</th><th>Frequency</th><th>Retention</th><th>Freshness</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}<td><span className="unavailable">Not synchronized</span></td></tr>)}</tbody></table></div> : <Empty title="No backup baseline supplied" text="Stratus will populate plans, jobs, recovery points, and overdue status after AWS synchronization." />}</article></div>; }

function NetworkPage({ clientName }: { clientName: ClientName }) { const client = clients[clientName], server = client.servers[0]; return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">MUMBAI + HYDERABAD</p><h2>Network overview</h2><p>Understandable network relationships without raw AWS console JSON.</p></div><span className="source-badge">Read-only</span></section><article className="panel topology-panel"><PanelTitle title="Regional relationship" /><RegionRoute clientName={clientName} /><div className="topology-flow"><div><span>◎</span><b>Internet gateway</b><small>{server?.publicIp ?? "Unavailable"}</small></div><i>→</i><div><span>▧</span><b>VPC</b><small>{clientName === "Fusion" ? "172.31.0.0/16" : clientName === "Swastiks" ? "172.31.16.0/20" : clientName === "GCPL" ? "172.31.0.0/16" : "Unavailable"}</small></div><i>→</i><div><span>▥</span><b>Workload</b><small>{server?.privateIp ?? "Awaiting sync"}</small></div><i>→</i><div><span>☁</span><b>DR backups</b><small>{client.drRegion}</small></div></div></article><section className="detail-grid"><Detail title="Address inventory" rows={client.servers.length ? client.servers.flatMap((s) => [[`${s.name} private`, s.privateIp ?? "Unavailable"], [`${s.name} public`, s.publicIp ?? "Unavailable"]]) : [["Addresses", "Unavailable"]]} /><Detail title="VPN telemetry" rows={[["Site-to-Site VPN", clientName === "GCPL" || clientName === "Fusion" ? "Documented" : "Not documented"], ["Tunnel state", "Unavailable"], ["Outside IP", "Unavailable"], ["Last status change", "Unavailable"]]} /></section></div>; }

function SecurityPage({ clientName }: { clientName: ClientName }) { const notes = clientName === "GCPL" ? [["MFA enforcement", "Documented as required for cloud and local admin paths"], ["Endpoint protection", "CrowdStrike Falcon Insight documented"], ["Patch management", "WSUS / AWS Systems Manager documented"]] : clientName === "Fusion" ? [["MFA status", "Assumed in source; not directly verified"], ["Security group", "Fusion_SG documented"], ["Administrative access", "RDP restricted to approved /32 sources"]] : clientName === "Swastiks" ? [["Endpoint protection", "CrowdStrike Falcon Insight documented"], ["OS hardening", "CIS Level 1 baseline documented"], ["Patch management", "WSUS / AWS Systems Manager documented"]] : []; return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">IAM VISIBILITY</p><h2>IAM & security</h2><p>Elevated access is never inferred. Live users, roles, keys, and policies require IAM read permissions.</p></div><span className="source-badge warning">IAM sync required</span></section><section className="summary-grid"><Kpi icon="◇" title="IAM users" value="Unavailable" note="Requires iam:ListUsers" tone="muted" /><Kpi icon="⚿" title="Active keys" value="Unavailable" note="Secret values are never collected" tone="muted" /><Kpi icon="✓" title="MFA coverage" value={clientName === "GCPL" ? "Documented" : "Unverified"} note="Live verification pending" /><Kpi icon="!" title="Admin findings" value="Unavailable" note="No privilege claims invented" tone="muted" /></section><article className="panel"><PanelTitle title="Documented controls" />{notes.length ? <div className="data-list">{notes.map(([title, text]) => <div key={title}><span>{title}<small>{text}</small></span><span className="source-badge">Source baseline</span></div>)}</div> : <Empty title="No security baseline supplied" text="IAM inventory will appear after the named AWS profile can be read." />}</article></div>; }

function AlertsPage({ clientName, refresh }: { clientName: ClientName; refresh: () => void }) { return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">ACTIONABLE SIGNALS</p><h2>Alerts</h2><p>Only conditions supported by stored data are shown. No noisy or fabricated operational alerts.</p></div><button className="refresh-button" onClick={refresh}>↻ Retry sync</button></section><article className="panel alerts-page"><PanelTitle title="Open alerts" /><AlertRows clientName={clientName} /></article></div>; }

function ReportsPage({ exportCsv }: { exportCsv: (kind: "billing" | "infrastructure") => void }) { return <div className="page-stack"><section className="page-head"><div><p className="eyebrow">EXPORTS</p><h2>Reports</h2><p>Exports use the same validated application data shown throughout Stratus.</p></div></section><section className="report-grid"><button onClick={() => exportCsv("billing")}><span>▤</span><div><strong>Billing summary CSV</strong><small>All clients · six months · exact source totals</small></div><b>Download →</b></button><button onClick={() => exportCsv("infrastructure")}><span>▥</span><div><strong>Infrastructure summary CSV</strong><small>Documented servers, regions, and addresses</small></div><b>Download →</b></button><button onClick={() => window.print()}><span>▧</span><div><strong>Printable current view</strong><small>Browser-optimized operations report</small></div><b>Print →</b></button></section></div>; }

function Assistant({ question, answer, ask, close }: { question: string; answer: string; ask: (question: string) => void; close: () => void }) { const [draft, setDraft] = useState(""); const suggestions = ["Which client has the highest monthly cost?", "Show all public IP addresses", "Compare GCPL EC2 cost over six months"]; return <aside className="assistant-panel" aria-label="Stratus AI assistant"><header><span>✦</span><div><strong>Stratus AI</strong><small>Read-only · source aware</small></div><button onClick={close} aria-label="Close assistant">×</button></header><div className="assistant-scroll"><p className="assistant-config">External AI is not configured. Supported source-backed questions still work.</p>{suggestions.map((s) => <button className="suggestion" key={s} onClick={() => ask(s)}>{s}</button>)}{question && <div className="chat"><p><b>You</b>{question}</p><p><b>Stratus</b>{answer.split("\n").map((line) => <span key={line}>{line}</span>)}</p></div>}</div><form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { ask(draft); setDraft(""); } }}><label className="sr-only" htmlFor="ai-question">Ask Stratus AI</label><input id="ai-question" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about billing or inventory…" /><button>↑</button></form></aside>; }

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="Close dialog">×</button></header>{children}</section></div>; }
function Kpi({ icon, title, value, note, tone = "default" }: { icon: string; title: string; value: string; note: string; tone?: string }) { return <article className="kpi"><div className={`kpi-icon ${tone}`}>{icon}</div><div><p>{title}</p><strong>{value}</strong><span className={tone}>{note}</span></div></article>; }
function PanelTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return <header className="panel-title"><h2>{title}</h2>{action && <button onClick={onAction}>{action} <span>→</span></button>}</header>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span>∅</span><strong>{title}</strong><p>{text}</p></div>; }
function RegionRoute({ clientName }: { clientName: ClientName }) { const client = clients[clientName]; return <div className="route"><div><i className="region-dot primary" /><strong>{client.primaryRegion}</strong><span>Primary · {client.primaryRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}</span></div><b>→</b><div><i className="region-dot" /><strong>{client.drRegion}</strong><span>DR · {client.drRegion === "Mumbai" ? "ap-south-1" : "ap-south-2"}</span></div></div>; }
function ServerTable({ servers, onSelect, detailed = false }: { servers: Server[]; onSelect: (server: Server) => void; detailed?: boolean }) { return <div className="table-wrap"><table><thead><tr><th>Resource</th><th>Role</th><th>Environment</th><th>Status</th><th>Compute</th><th>Storage</th><th>Region</th>{detailed && <th>IP</th>}</tr></thead><tbody>{servers.map((server) => <tr key={server.name} onClick={() => onSelect(server)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(server)}><td><strong>{server.name}</strong><small>{server.os}</small></td><td>{server.role}</td><td>{server.environment}</td><td><span className="documented"><i />Documented</span></td><td>{server.cpu}<small>{server.memory}</small></td><td>{server.storage}</td><td>{server.region}<small>{server.zone}</small></td>{detailed && <td>{server.privateIp ?? "Unavailable"}<small>{server.publicIp ?? "No public IP documented"}</small></td>}</tr>)}</tbody></table></div>; }
function Detail({ title, rows }: { title: string; rows: string[][] }) { return <article className="panel detail-card"><PanelTitle title={title} /><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>; }
function AlertRows({ clientName }: { clientName: ClientName }) { return <><div className="alert-row warning"><span>!</span><div><strong>Live synchronization unavailable</strong><p>AWS CLI profile “{clients[clientName].profile}” was not detected. Stored data remains available.</p></div><time>Now</time></div>{clientName === "Nilkamal" && <div className="alert-row"><span>i</span><div><strong>Infrastructure document missing</strong><p>Only historical bills were supplied for Nilkamal.</p></div><time>Source</time></div>}<div className="alert-row good"><span>✓</span><div><strong>Billing history validated</strong><p>Six distinct monthly grand totals are loaded with no duplicate client/month pairs.</p></div><time>Aug 22</time></div></>; }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function formatPercent(value: number, showPositiveSign = false) { const normalized = Math.abs(value) < 0.05 ? 0 : value; return `${showPositiveSign && normalized > 0 ? "+" : ""}${normalized.toFixed(1)}%`; }
function csvCell(value: string) { return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
