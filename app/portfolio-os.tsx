"use client";

import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applications,
  education,
  experience,
  profile,
  projects,
  skillGroups,
  type AppId,
  type Project,
} from "./data";

type WindowId = AppId | `project:${string}:${number}`;

type WindowState = {
  id: WindowId;
  appId: AppId | "project";
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  projectId?: string;
};

type Notification = { id: number; text: string; tone?: "success" | "warning" };
type ContextMenuState = { x: number; y: number } | null;
type DragAction = {
  id: WindowId;
  kind: "drag" | "resize";
  startX: number;
  startY: number;
  startPosition: { x: number; y: number };
  startSize: { width: number; height: number };
};

const WINDOW_DEFAULTS: Record<AppId, { position: { x: number; y: number }; size: { width: number; height: number } }> = {
  about: { position: { x: 172, y: 104 }, size: { width: 690, height: 525 } },
  projects: { position: { x: 208, y: 76 }, size: { width: 850, height: 625 } },
  skills: { position: { x: 244, y: 118 }, size: { width: 680, height: 510 } },
  experience: { position: { x: 270, y: 94 }, size: { width: 650, height: 550 } },
  resume: { position: { x: 226, y: 56 }, size: { width: 780, height: 650 } },
  contact: { position: { x: 282, y: 132 }, size: { width: 610, height: 500 } },
  terminal: { position: { x: 324, y: 110 }, size: { width: 690, height: 460 } },
};

const APP_TITLE: Record<AppId, string> = Object.fromEntries(
  applications.map((app) => [app.id, app.label]),
) as Record<AppId, string>;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const nowText = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

export function PortfolioOS() {
  const [booting, setBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppId | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [recruiterMode, setRecruiterMode] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState(
    "I use the local portfolio archive. Ask about React, Firebase, strongest projects, or how to make contact.",
  );
  const dragAction = useRef<DragAction | null>(null);
  const nextWindow = useRef(0);

  const notify = useCallback((text: string, tone: Notification["tone"] = "success") => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setNotifications((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setNotifications((current) => current.filter((notification) => notification.id !== id));
    }, 4200);
  }, []);

  const resetWindowLayout = useCallback(() => {
    setWindows([]);
    setSelectedApp(null);
    notify("Window layout reset to desktop defaults.");
  }, [notify]);

  const focusWindow = useCallback((id: WindowId) => {
    setWindows((current) => {
      const peak = Math.max(20, ...current.map((window) => window.zIndex));
      return current.map((window) =>
        window.id === id ? { ...window, zIndex: peak + 1, isMinimized: false } : window,
      );
    });
  }, []);

  const openWindow = useCallback(
    (appId: AppId) => {
      setContextMenu(null);
      setSelectedApp(appId);
      setWindows((current) => {
        const existing = current.find((window) => window.id === appId);
        const peak = Math.max(20, ...current.map((window) => window.zIndex));
        if (existing) {
          return current.map((window) =>
            window.id === appId
              ? { ...window, isMinimized: false, zIndex: peak + 1 }
              : window,
          );
        }
        const preset = WINDOW_DEFAULTS[appId];
        return [
          ...current,
          {
            id: appId,
            appId,
            title: APP_TITLE[appId],
            position: preset.position,
            size: preset.size,
            isMinimized: false,
            isMaximized: false,
            zIndex: peak + 1,
          },
        ];
      });
    },
    [],
  );

  const openProject = useCallback((project: Project) => {
    nextWindow.current += 1;
    const count = nextWindow.current;
    setSelectedApp("projects");
    setWindows((current) => {
      const peak = Math.max(20, ...current.map((window) => window.zIndex));
      return [
        ...current,
        {
          id: `project:${project.id}:${count}`,
          appId: "project",
          title: project.title,
          projectId: project.id,
          position: { x: 268 + (count % 4) * 26, y: 82 + (count % 4) * 24 },
          size: { width: 720, height: 585 },
          isMinimized: false,
          isMaximized: false,
          zIndex: peak + 1,
        },
      ];
    });
  }, []);

  const closeWindow = useCallback((id: WindowId) => {
    setWindows((current) => current.filter((window) => window.id !== id));
  }, []);

  const toggleMaximize = useCallback((id: WindowId) => {
    setWindows((current) =>
      current.map((window) =>
        window.id === id ? { ...window, isMaximized: !window.isMaximized } : window,
      ),
    );
  }, []);

  const minimizeWindow = useCallback((id: WindowId) => {
    setWindows((current) =>
      current.map((window) =>
        window.id === id ? { ...window, isMinimized: true } : window,
      ),
    );
  }, []);

  const moveWindow = useCallback((id: WindowId, position: { x: number; y: number }) => {
    setWindows((current) =>
      current.map((window) => (window.id === id ? { ...window, position } : window)),
    );
  }, []);

  const resizeWindow = useCallback((id: WindowId, size: { width: number; height: number }) => {
    setWindows((current) =>
      current.map((window) => (window.id === id ? { ...window, size } : window)),
    );
  }, []);

  const toggleMotion = useCallback(() => {
    setMotionEnabled((enabled) => {
      notify(`Motion ${enabled ? "disabled" : "enabled"}.`, "warning");
      return !enabled;
    });
  }, [notify]);

  const togglePerformance = useCallback(() => {
    setPerformanceMode((enabled) => {
      notify(`Performance mode ${enabled ? "disabled" : "enabled"}.`, "warning");
      return !enabled;
    });
  }, [notify]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const completed = window.sessionStorage.getItem("sf-os-booted") === "true";
    if (reduced || completed) {
      const instantCompletion = window.setTimeout(() => {
        setMotionEnabled(!reduced);
        setBooting(false);
      }, 0);
      return () => window.clearTimeout(instantCompletion);
    }
    const steps = window.setInterval(() => setBootStep((current) => current + 1), 330);
    const completion = window.setTimeout(() => {
      window.sessionStorage.setItem("sf-os-booted", "true");
      setBooting(false);
    }, 2180);
    return () => {
      window.clearInterval(steps);
      window.clearTimeout(completion);
    };
  }, []);

  useEffect(() => {
    const updateViewport = () => setMobile(window.innerWidth < 760);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const skipBoot = () => {
    window.sessionStorage.setItem("sf-os-booted", "true");
    setBooting(false);
  };

  const beginInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    windowState: WindowState,
    kind: DragAction["kind"],
  ) => {
    if (mobile || windowState.isMaximized) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragAction.current = {
      id: windowState.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: windowState.position,
      startSize: windowState.size,
    };
    focusWindow(windowState.id);
  };

  const continueInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const action = dragAction.current;
    if (!action) return;
    const deltaX = event.clientX - action.startX;
    const deltaY = event.clientY - action.startY;
    if (action.kind === "drag") {
      moveWindow(action.id, {
        x: clamp(action.startPosition.x + deltaX, 8, window.innerWidth - 160),
        y: clamp(action.startPosition.y + deltaY, 42, window.innerHeight - 90),
      });
    } else {
      resizeWindow(action.id, {
        width: clamp(action.startSize.width + deltaX, 360, window.innerWidth - 20),
        height: clamp(action.startSize.height + deltaY, 320, window.innerHeight - 92),
      });
    }
  };

  const endInteraction = () => {
    dragAction.current = null;
  };

  const desktopMenu = [
    { label: "Open Projects", action: () => openWindow("projects") },
    { label: "Open Terminal", action: () => openWindow("terminal") },
    { label: "View Resume", action: () => openWindow("resume") },
    { label: motionEnabled ? "Disable Motion" : "Enable Motion", action: toggleMotion },
    { label: performanceMode ? "Disable Performance Mode" : "Enable Performance Mode", action: togglePerformance },
    { label: "Reset Window Layout", action: resetWindowLayout },
  ];

  const paletteActions = useMemo(
    () => [
      ...applications.map((app) => ({ label: `Open ${app.label}`, detail: app.status, action: () => openWindow(app.id) })),
      ...projects.map((project) => ({ label: `Open ${project.title}`, detail: "PROJECT CASE STUDY", action: () => openProject(project) })),
      { label: "Reset Window Layout", detail: "SYSTEM", action: resetWindowLayout },
      { label: motionEnabled ? "Disable Motion" : "Enable Motion", detail: "PREFERENCES", action: toggleMotion },
      { label: "Open recruiter view", detail: "RESUME", action: () => { setRecruiterMode(true); openWindow("resume"); } },
    ],
    [motionEnabled, openProject, openWindow, resetWindowLayout, toggleMotion],
  );

  const matchingActions = paletteActions.filter((action) =>
    `${action.label} ${action.detail}`.toLowerCase().includes(commandQuery.toLowerCase()),
  );

  const updateCommandQuery = (value: string) => {
    setCommandQuery(value);
    setCommandIndex(0);
  };

  const runAssistant = (rawQuestion: string) => {
    const question = rawQuestion.toLowerCase();
    if (question.includes("react")) {
      const found = projects.filter((project) => project.stack.includes("React")).slice(0, 5);
      setAssistantAnswer(`${found.map((project) => project.title).join(", ")} use React. Opening the project archive.`);
      openWindow("projects");
    } else if (question.includes("firebase")) {
      const found = projects.filter((project) => project.stack.includes("Firebase"));
      setAssistantAnswer(`Firebase appears in ${found.map((project) => project.title).join(", ")}.`);
    } else if (question.includes("strong") || question.includes("best")) {
      const found = projects.filter((project) => project.featured).map((project) => project.title);
      setAssistantAnswer(`Featured work: ${found.join(", ")}. These best demonstrate product depth and interface polish.`);
    } else if (question.includes("contact") || question.includes("hire")) {
      setAssistantAnswer("Opening the transmission console. The form validates locally and is ready for a Formspree endpoint when one is configured.");
      openWindow("contact");
    } else if (question.includes("resume")) {
      setAssistantAnswer("Opening the resume dossier in recruiter mode.");
      setRecruiterMode(true);
      openWindow("resume");
    } else {
      setAssistantAnswer("Try: “strongest projects”, “React work”, “Firebase projects”, “open the resume”, or “how can I make contact?”");
    }
  };

  return (
    <main
      className={`os ${motionEnabled ? "motion-on" : "motion-off"} ${performanceMode ? "performance-mode" : ""} ${recruiterMode ? "recruiter-mode" : ""}`}
      data-active={windows.length ? windows.reduce((top, item) => (item.zIndex > top.zIndex ? item : top)).appId : "desktop"}
      onClick={() => setContextMenu(null)}
      onContextMenu={(event) => {
        if (mobile) return;
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <Wallpaper />
      <header className="topbar" aria-label="System status">
        <button className="system-mark" onClick={() => openWindow("about")} aria-label="Open About application">
          <span>SF</span><b>OS</b><i>Portfolio terminal</i>
        </button>
        <div className="status-readout">
          <span className="availability"><i /> {profile.availability}</span>
          <span>{motionEnabled ? "MOTION / ON" : "MOTION / OFF"}</span>
          <time>{nowText(clock)}</time>
        </div>
      </header>

      {!mobile && (
        <aside className="desktop-icons" aria-label="Desktop applications">
          {applications.map((app) => (
            <button
              className={`desktop-icon ${selectedApp === app.id ? "selected" : ""}`}
              key={app.id}
              onClick={(event) => { event.stopPropagation(); setSelectedApp(app.id); }}
              onDoubleClick={() => openWindow(app.id)}
              aria-label={`Open ${app.label}`}
            >
              <span className="icon-sigil" aria-hidden="true">{app.glyph}</span>
              <span>{app.label}</span>
              <small>{app.status}</small>
            </button>
          ))}
        </aside>
      )}

      <section className="desktop-intro" aria-label="Portfolio overview">
        <p className="eyebrow">SYSTEM READY / 2026</p>
        <h1>Builds with intent.<br /><em>Ships with care.</em></h1>
        <p>{profile.role} crafting clear, responsive web products with a strong technical core.</p>
        <div className="quick-actions">
          <button onClick={() => openWindow("projects")}>Explore projects <span>↗</span></button>
          <button onClick={() => openWindow("resume")}>Resume dossier <span>▤</span></button>
          <button onClick={() => openWindow("contact")}>Open contact <span>◒</span></button>
        </div>
        <div className="intro-foot"><span>10 PROJECT ARCHIVES</span><span>FULL-STACK / UI / DATA</span></div>
      </section>

      <section className="window-layer" aria-label="Open applications">
        {windows.map((windowState) => (
          <AppWindow
            key={windowState.id}
            windowState={windowState}
            mobile={mobile}
            onFocus={() => focusWindow(windowState.id)}
            onClose={() => closeWindow(windowState.id)}
            onMinimize={() => minimizeWindow(windowState.id)}
            onMaximize={() => toggleMaximize(windowState.id)}
            onBeginInteraction={beginInteraction}
            onContinueInteraction={continueInteraction}
            onEndInteraction={endInteraction}
          >
            <WindowContent
              windowState={windowState}
              openWindow={openWindow}
              openProject={openProject}
              notify={notify}
              resetWindowLayout={resetWindowLayout}
              toggleMotion={toggleMotion}
              togglePerformance={togglePerformance}
              recruiterMode={recruiterMode}
              setRecruiterMode={setRecruiterMode}
            />
          </AppWindow>
        ))}
      </section>

      <Dock windows={windows} selectedApp={selectedApp} onOpen={openWindow} onFocus={focusWindow} />

      <button className="command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open command palette">
        <span>⌘</span> Command <kbd>Ctrl K</kbd>
      </button>

      <section className={`assistant ${assistantOpen ? "expanded" : ""}`} aria-label="Portfolio Intelligence assistant">
        <button className="assistant-head" onClick={() => setAssistantOpen((current) => !current)} aria-expanded={assistantOpen}>
          <span className="assistant-orb">✦</span>
          <span><b>Portfolio Intelligence</b><small>Local data assistant</small></span>
          <i>{assistantOpen ? "−" : "+"}</i>
        </button>
        {assistantOpen && (
          <div className="assistant-body">
            <p>{assistantAnswer}</p>
            <div className="assistant-suggestions">
              {["Strongest projects", "React work", "Firebase projects", "Open resume"].map((suggestion) => (
                <button key={suggestion} onClick={() => runAssistant(suggestion)}>{suggestion}</button>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); runAssistant(assistantQuestion); }}>
              <label className="sr-only" htmlFor="assistant-question">Ask the portfolio assistant</label>
              <input id="assistant-question" value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask about this portfolio…" />
              <button type="submit" aria-label="Send question">↗</button>
            </form>
          </div>
        )}
      </section>

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>
          <span>DESKTOP OPERATIONS</span>
          {desktopMenu.map((item) => <button key={item.label} role="menuitem" onClick={item.action}>{item.label}</button>)}
        </div>
      )}

      {commandOpen && (
        <CommandPalette
          query={commandQuery}
          setQuery={updateCommandQuery}
          actions={matchingActions}
          index={commandIndex}
          setIndex={setCommandIndex}
          onClose={() => setCommandOpen(false)}
        />
      )}

      <div className="notifications" aria-live="polite" aria-atomic="true">
        {notifications.map((notification) => (
          <div className={`notification ${notification.tone ?? "success"}`} key={notification.id}>
            <span>{notification.tone === "warning" ? "△" : "✓"}</span><p>{notification.text}</p>
            <button aria-label="Dismiss notification" onClick={() => setNotifications((current) => current.filter((item) => item.id !== notification.id))}>×</button>
          </div>
        ))}
      </div>

      {booting && <BootScreen step={bootStep} onSkip={skipBoot} />}
    </main>
  );
}

function Wallpaper() {
  return <div className="wallpaper" aria-hidden="true"><div className="energy" /><div className="grid" /><div className="motes" /></div>;
}

function BootScreen({ step, onSkip }: { step: number; onSkip: () => void }) {
  const logs = ["INITIALIZING SF-OS", "VERIFYING INTERFACE MODULES", "MOUNTING PROJECT ARCHIVES", "LOADING EXPERIENCE DATABASE", "STARTING MOTION ENGINE", "SYSTEM READY"];
  const complete = Math.min(step, logs.length);
  return (
    <section className="boot-screen" aria-label="Loading Portfolio OS">
      <div className="boot-panel">
        <p className="boot-mark">SF<span>OS</span></p>
        <div className="boot-line"><i style={{ width: `${Math.max(8, (complete / logs.length) * 100)}%` }} /></div>
        <div className="boot-logs">{logs.slice(0, complete).map((log) => <p key={log}>› {log}<b>OK</b></p>)}</div>
        <button onClick={onSkip}>Skip boot sequence <span>↗</span></button>
      </div>
    </section>
  );
}

function AppWindow({
  windowState,
  mobile,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onBeginInteraction,
  onContinueInteraction,
  onEndInteraction,
  children,
}: {
  windowState: WindowState;
  mobile: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onBeginInteraction: (event: ReactPointerEvent<HTMLElement>, state: WindowState, kind: DragAction["kind"]) => void;
  onContinueInteraction: (event: ReactPointerEvent<HTMLElement>) => void;
  onEndInteraction: () => void;
  children: React.ReactNode;
}) {
  const app = windowState.appId === "project"
    ? { glyph: "◇", status: "CASE STUDY" }
    : applications.find((item) => item.id === windowState.appId) ?? { glyph: "◈", status: "APPLICATION" };
  const style: CSSProperties = windowState.isMaximized
    ? { left: 12, top: 50, width: "calc(100vw - 24px)", height: "calc(100vh - 142px)", zIndex: windowState.zIndex }
    : { left: windowState.position.x, top: windowState.position.y, width: windowState.size.width, height: windowState.size.height, zIndex: windowState.zIndex };
  return (
    <article
      className={`app-window ${windowState.isMinimized ? "minimized" : ""} ${windowState.isMaximized ? "maximized" : ""}`}
      style={style}
      onPointerDown={onFocus}
      aria-label={`${windowState.title} application window`}
    >
      <header
        className="window-titlebar"
        onPointerDown={(event) => onBeginInteraction(event, windowState, "drag")}
        onPointerMove={onContinueInteraction}
        onPointerUp={onEndInteraction}
        onDoubleClick={onMaximize}
      >
        <span className="window-sigil">{app.glyph}</span>
        <span className="window-title"><b>{windowState.title}</b><small>{app.status}</small></span>
        <div className="window-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button aria-label={`Minimize ${windowState.title}`} onClick={onMinimize}>−</button>
          <button aria-label={windowState.isMaximized ? `Restore ${windowState.title}` : `Maximize ${windowState.title}`} onClick={onMaximize}>{windowState.isMaximized ? "↙" : "□"}</button>
          <button className="close" aria-label={`Close ${windowState.title}`} onClick={onClose}>×</button>
        </div>
      </header>
      <div className="window-content">{children}</div>
      {!mobile && !windowState.isMaximized && (
        <div
          className="resize-handle"
          onPointerDown={(event) => onBeginInteraction(event, windowState, "resize")}
          onPointerMove={onContinueInteraction}
          onPointerUp={onEndInteraction}
          aria-hidden="true"
        />
      )}
    </article>
  );
}

function WindowContent({
  windowState,
  openWindow,
  openProject,
  notify,
  resetWindowLayout,
  toggleMotion,
  togglePerformance,
  recruiterMode,
  setRecruiterMode,
}: {
  windowState: WindowState;
  openWindow: (app: AppId) => void;
  openProject: (project: Project) => void;
  notify: (text: string, tone?: Notification["tone"]) => void;
  resetWindowLayout: () => void;
  toggleMotion: () => void;
  togglePerformance: () => void;
  recruiterMode: boolean;
  setRecruiterMode: (value: boolean) => void;
}) {
  if (windowState.appId === "project") {
    const project = projects.find((item) => item.id === windowState.projectId);
    return project ? <ProjectCaseStudy project={project} openProject={openProject} /> : <EmptyState label="Project archive unavailable" />;
  }
  switch (windowState.appId) {
    case "about": return <AboutApp openWindow={openWindow} notify={notify} />;
    case "projects": return <ProjectsApp openProject={openProject} />;
    case "skills": return <SkillsApp openProject={openProject} />;
    case "experience": return <ExperienceApp />;
    case "resume": return <ResumeApp notify={notify} recruiterMode={recruiterMode} setRecruiterMode={setRecruiterMode} openProject={openProject} />;
    case "contact": return <ContactApp notify={notify} />;
    case "terminal": return <TerminalApp openWindow={openWindow} openProject={openProject} notify={notify} resetWindowLayout={resetWindowLayout} toggleMotion={toggleMotion} togglePerformance={togglePerformance} />;
    default: return <EmptyState label="Application module unavailable" />;
  }
}

function AboutApp({ openWindow, notify }: { openWindow: (app: AppId) => void; notify: (text: string) => void }) {
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      notify("Contact email copied to clipboard.");
    } catch {
      notify(`Email: ${profile.email}`);
    }
  };
  return <div className="about-app app-pad">
    <section className="identity-card">
      <div className="identity-sigil"><span>S</span><i /></div>
      <div><p className="eyebrow">DIGITAL IDENTITY / VERIFIED</p><h2>{profile.name}</h2><h3>{profile.role}</h3><p>{profile.focus}</p></div>
      <div className="identity-status"><span><i /> AVAILABLE</span><small>{profile.location}</small></div>
    </section>
    <section className="stat-row">
      {[{ value: "10", label: "PROJECT ARCHIVES" }, { value: "14+", label: "CORE TOOLS" }, { value: "03", label: "FOCUS AREAS" }].map((metric) => <div key={metric.label}><b>{metric.value}</b><span>{metric.label}</span></div>)}
    </section>
    <section className="about-grid">
      <div><p className="section-label">DEVELOPMENT PHILOSOPHY</p><p className="large-copy">{profile.philosophy}</p></div>
      <div><p className="section-label">CURRENT STACK</p><div className="chip-row">{["React", "TypeScript", "Tailwind", "Firebase", "Supabase", "Vite"].map((skill) => <span key={skill}>{skill}</span>)}</div></div>
    </section>
    <div className="window-footer-actions"><button onClick={() => openWindow("projects")}>View selected work ↗</button><button onClick={copyEmail}>Copy email</button><button onClick={() => openWindow("contact")}>Transmission console</button></div>
  </div>;
}

function ProjectsApp({ openProject }: { openProject: (project: Project) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [detailed, setDetailed] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const categories = ["All", "Full-stack", "Product", "Data", "Creative UI"];
  const filtered = projects.filter((project) => {
    const haystack = `${project.title} ${project.description} ${project.stack.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === "All" || project.category === category) && (!featuredOnly || project.featured);
  });
  return <div className="projects-app app-pad">
    <div className="app-heading"><div><p className="eyebrow">PROJECT LIBRARY / {projects.length.toString().padStart(2, "0")} ARCHIVES</p><h2>Work with a point of view.</h2></div><button className="view-toggle" onClick={() => setMapOpen((current) => !current)}>{mapOpen ? "Grid view" : "Spatial map"} ◌</button></div>
    {mapOpen ? <ProjectMap openProject={openProject} /> : <>
      <div className="project-toolbar">
        <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects or technology" /></label>
        <div className="filters" aria-label="Project filters">{categories.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
        <button className={featuredOnly ? "small-toggle active" : "small-toggle"} onClick={() => setFeaturedOnly((current) => !current)}>Featured</button>
        <button className="small-toggle" onClick={() => setDetailed((current) => !current)}>{detailed ? "Compact" : "Detailed"}</button>
      </div>
      <div className="projects-count"><span>{filtered.length} matching archives</span><button onClick={() => { setQuery(""); setCategory("All"); setFeaturedOnly(false); }}>Reset filters</button></div>
      <div className={`project-grid ${detailed ? "detailed" : "compact"}`}>
        {filtered.map((project) => <ProjectCard key={project.id} project={project} detailed={detailed} onOpen={() => openProject(project)} />)}
      </div>
    </>}
  </div>;
}

function ProjectCard({ project, detailed, onOpen }: { project: Project; detailed: boolean; onOpen: () => void }) {
  return <article className="project-card" style={{ "--project-accent": project.accent } as CSSProperties} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}>
    <div className="project-preview"><span className="preview-kicker">{project.category}</span><div className={`preview-shape ${project.id}`}><i /><b /><em /></div><small>{project.status === "in-progress" ? "IN PROGRESS" : project.featured ? "FEATURED BUILD" : "PROJECT ARCHIVE"}</small></div>
    <div className="project-info"><div className="project-title"><div><h3>{project.title}</h3><p>{project.subtitle}</p></div>{project.featured && <span className="featured-mark">✦</span>}</div>{detailed && <p className="project-description">{project.description}</p>}<div className="chip-row">{project.stack.slice(0, detailed ? 4 : 2).map((technology) => <span key={technology}>{technology}</span>)}</div><div className="project-actions"><button onClick={onOpen}>Open case study <span>↗</span></button><span>NO PUBLIC LINK</span></div></div>
  </article>;
}

function ProjectMap({ openProject }: { openProject: (project: Project) => void }) {
  const featured = projects.filter((project) => project.featured);
  return <section className="project-map" aria-label="Project and technology relationship map"><div className="map-ring ring-one" /><div className="map-ring ring-two" /><p className="map-label react-label">REACT</p><p className="map-label firebase-label">FIREBASE</p>{featured.map((project, index) => <button key={project.id} className={`map-node node-${index}`} onClick={() => openProject(project)}><i /><span>{project.title}</span><small>{project.stack.slice(0, 2).join(" / ")}</small></button>)}<div className="map-caption"><span>RELATIONSHIP MAP</span><p>Select a project node to open its full case study.</p></div></section>;
}

function ProjectCaseStudy({ project, openProject }: { project: Project; openProject: (project: Project) => void }) {
  const nextProject = projects[(projects.findIndex((item) => item.id === project.id) + 1) % projects.length];
  return <div className="case-study app-pad">
    <section className="case-hero" style={{ "--project-accent": project.accent } as CSSProperties}><div><p className="eyebrow">CASE STUDY / {project.category.toUpperCase()}</p><h2>{project.title}</h2><p>{project.subtitle}</p></div><div className="case-orb"><i /><b /></div></section>
    <div className="case-summary"><div><p className="section-label">PRODUCT BRIEF</p><p>{project.description}</p></div><div><p className="section-label">STATUS</p><p className="status-text"><i /> {project.status.replace("-", " ")}</p></div></div>
    <section className="case-columns"><div><p className="section-label">KEY CAPABILITIES</p><ul>{project.features.map((feature) => <li key={feature}> <span>↗</span>{feature}</li>)}</ul></div><div><p className="section-label">TECHNICAL DECISION</p><p>{project.challenge}</p><p className="section-label next-label">OUTCOME</p><p>{project.outcome}</p></div></section>
    <div className="case-stack"><p className="section-label">STACK</p><div className="chip-row">{project.stack.map((technology) => <span key={technology}>{technology}</span>)}</div></div>
    <button className="next-case" onClick={() => openProject(nextProject)}>Open next archive <b>{nextProject.title}</b><span>↗</span></button>
  </div>;
}

function SkillsApp({ openProject }: { openProject: (project: Project) => void }) {
  const [activeGroup, setActiveGroup] = useState(0);
  const projectsForSkill = projects.filter((project) => project.stack.some((skill) => skillGroups[activeGroup].skills.includes(skill))).slice(0, 4);
  return <div className="skills-app app-pad"><div className="app-heading"><div><p className="eyebrow">CAPABILITY MATRIX</p><h2>Systems, not just tools.</h2></div><span className="signal-badge"><i /> ACTIVE PRACTICE</span></div><div className="skills-layout"><nav className="skill-tabs" aria-label="Skill categories">{skillGroups.map((group, index) => <button className={index === activeGroup ? "active" : ""} key={group.label} onClick={() => setActiveGroup(index)}><span>0{index + 1}</span>{group.label}</button>)}</nav><section className="skill-detail"><p className="section-label">{skillGroups[activeGroup].label.toUpperCase()}</p><div className="skill-cloud">{skillGroups[activeGroup].skills.map((skill, index) => <span style={{ "--skill-index": index } as CSSProperties} key={skill}>{skill}</span>)}</div><p className="section-label work-label">RELATED ARCHIVES</p><div className="related-projects">{projectsForSkill.map((project) => <button key={project.id} onClick={() => openProject(project)}><span>{project.title}</span><i>↗</i></button>)}</div></section></div><div className="skill-foot"><span>Working across visual quality, data flows, and the details that make a product feel considered.</span><b>SELECT A DOMAIN TO EXPLORE</b></div></div>;
}

function ExperienceApp() {
  const [selected, setSelected] = useState(0);
  return <div className="experience-app app-pad"><div className="app-heading"><div><p className="eyebrow">EXPERIENCE LOG</p><h2>Learning in public. Building in depth.</h2></div><span className="timeline-count">0{experience.length} ENTRIES</span></div><div className="timeline">{experience.map((item, index) => <button key={item.title} className={selected === index ? "active" : ""} onClick={() => setSelected(index)}><span className="timeline-period">{item.period}</span><span className="timeline-point" /><span className="timeline-copy"><b>{item.title}</b><small>{item.place}</small>{selected === index && <p>{item.detail}</p>}</span></button>)}</div><section className="education-block"><p className="section-label">EDUCATION</p>{education.map((item) => <div key={item.title}><b>{item.title}</b><span>{item.meta}</span></div>)}</section></div>;
}

function ResumeApp({ notify, recruiterMode, setRecruiterMode, openProject }: { notify: (text: string, tone?: Notification["tone"]) => void; recruiterMode: boolean; setRecruiterMode: (value: boolean) => void; openProject: (project: Project) => void }) {
  const [view, setView] = useState("Overview");
  const resumeAvailable = false;
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(profile.email); notify("Email copied to clipboard."); } catch { notify(`Email: ${profile.email}`); }
  };
  const viewContent: Record<string, React.ReactNode> = {
    Overview: <><p className="resume-summary">Full-stack developer with a product-minded approach to React applications, interface systems, and accessible experiences.</p><div className="resume-stats"><span><b>10</b> portfolio projects</span><span><b>3</b> focus domains</span><span><b>14+</b> core technologies</span></div></>,
    Experience: <div className="resume-list">{experience.map((item) => <div key={item.title}><small>{item.period}</small><b>{item.title}</b><span>{item.place}</span></div>)}</div>,
    Skills: <div className="resume-skills">{skillGroups.flatMap((group) => group.skills).map((skill) => <span key={skill}>{skill}</span>)}</div>,
    Projects: <div className="resume-projects">{projects.filter((project) => project.featured).map((project) => <button key={project.id} onClick={() => openProject(project)}><span><b>{project.title}</b><small>{project.subtitle}</small></span><i>↗</i></button>)}</div>,
    Education: <div className="resume-list">{education.map((item) => <div key={item.title}><b>{item.title}</b><span>{item.meta}</span></div>)}</div>,
    Certifications: <p className="empty-copy">Certification records can be added to the portfolio data when issued.</p>,
  };
  return <div className={`resume-app app-pad ${recruiterMode ? "recruiter" : ""}`}><div className="resume-top"><div><p className="eyebrow">RESUME / INTERACTIVE DOSSIER</p><h2>{profile.name}<span>{profile.role}</span></h2></div><button className={recruiterMode ? "recruiter-switch active" : "recruiter-switch"} onClick={() => setRecruiterMode(!recruiterMode)}><i /> Recruiter view</button></div>{recruiterMode ? <section className="recruiter-sheet"><p className="section-label">RECRUITER SNAPSHOT</p><h3>Product-oriented developer who pairs polished interface work with practical full-stack delivery.</h3><div className="recruiter-columns"><div><b>Core stack</b><p>React · TypeScript · Tailwind · Firebase · Supabase</p></div><div><b>Best evidence</b><p>LocalHarvest · CodeLore · Silent Auction Hub · UI Library</p></div><div><b>Availability</b><p>{profile.availability}</p></div></div></section> : <><nav className="resume-tabs">{Object.keys(viewContent).map((tab) => <button className={view === tab ? "active" : ""} key={tab} onClick={() => setView(tab)}>{tab}</button>)}</nav><section className="resume-view">{viewContent[view]}</section></>}<div className="resume-actions"><button onClick={copyEmail}>Copy email</button><button onClick={() => window.print()}>Print / save PDF</button><button disabled={!resumeAvailable} title="Place your final PDF at public/resume/stephen-portfolio-resume.pdf">Download PDF {resumeAvailable ? "↗" : "(not installed)"}</button></div><p className="resume-note">To enable the direct download, add <code>stephen-portfolio-resume.pdf</code> in <code>public/resume/</code>.</p></div>;
}

function ContactApp({ notify }: { notify: (text: string, tone?: Notification["tone"]) => void }) {
  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const validate = () => {
    const next: Record<string, string> = {};
    if (values.name.trim().length < 2) next.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) next.email = "Enter a valid email.";
    if (values.subject.trim().length < 3) next.subject = "Add a short subject.";
    if (values.message.trim().length < 12) next.message = "Message should be at least 12 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) { setStatus("Please review the highlighted fields."); return; }
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setStatus("Delivery endpoint is not configured yet. Your message was not sent.");
      notify("Transmission needs a configured form endpoint.", "warning");
    }, 650);
  };
  return <div className="contact-app app-pad"><div className="contact-heading"><div><p className="eyebrow">COMMUNICATION UPLINK</p><h2>Start a conversation.</h2><p>Connection status: <b><i /> AVAILABLE</b></p></div><div className="contact-meta"><span>CHANNEL / CONTACT FORM</span><span>DELIVERY / CONFIGURE ENDPOINT</span></div></div><form className="contact-form" onSubmit={submit} noValidate><div className="form-grid"><Field label="Your name" name="name" value={values.name} error={errors.name} onChange={(value) => setValues({ ...values, name: value })} /><Field label="Email address" name="email" type="email" value={values.email} error={errors.email} onChange={(value) => setValues({ ...values, email: value })} /></div><Field label="Subject" name="subject" value={values.subject} error={errors.subject} onChange={(value) => setValues({ ...values, subject: value })} /><Field label="Message" name="message" value={values.message} error={errors.message} onChange={(value) => setValues({ ...values, message: value })} textarea /><div className="contact-submit"><span>{status || "Client-side validation is active. No message is sent until a delivery endpoint is configured."}</span><button type="submit" disabled={submitting}>{submitting ? "Validating…" : "Prepare transmission ↗"}</button></div></form><div className="contact-rail"><button onClick={async () => { try { await navigator.clipboard.writeText(profile.email); notify("Contact email copied."); } catch { notify(profile.email); } }}>Copy contact email</button><span>{profile.email}</span></div></div>;
}

function Field({ label, name, value, error, onChange, type = "text", textarea = false }: { label: string; name: string; value: string; error?: string; onChange: (value: string) => void; type?: string; textarea?: boolean }) {
  return <label className={`field ${error ? "has-error" : ""}`}><span>{label}</span>{textarea ? <textarea name={name} value={value} onChange={(event) => onChange(event.target.value)} rows={4} /> : <input name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} />}{error && <small>{error}</small>}</label>;
}

function TerminalApp({ openWindow, openProject, notify, resetWindowLayout, toggleMotion, togglePerformance }: { openWindow: (app: AppId) => void; openProject: (project: Project) => void; notify: (text: string, tone?: Notification["tone"]) => void; resetWindowLayout: () => void; toggleMotion: () => void; togglePerformance: () => void }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lines, setLines] = useState<string[]>(["SF-OS terminal v1.0.0", "Type ‘help’ for available commands."]);
  const outputRef = useRef<HTMLDivElement>(null);
  useEffect(() => { outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight }); }, [lines]);
  const commandNames = ["help", "about", "projects", "skills", "experience", "resume", "contact", "terminal", "clear", "whoami", "status", "date", "theme", "history", "open", "system-info", "reset-layout", "motion", "performance", "matrix", "coffee", "fortune", "reboot", "sudo"];
  const execute = (raw: string) => {
    const command = raw.trim().toLowerCase();
    if (!command) return;
    setHistory((current) => [...current, raw]);
    setHistoryIndex(-1);
    if (command === "clear") { setLines([]); return; }
    const add = (message: string) => setLines((current) => [...current, `sf@portfolio:~$ ${raw}`, message]);
    if (command === "help") add("help · about · projects [--featured|--react|--firebase] · skills · experience · resume [--download] · contact [--email] · open <app> · history · system-info · reset-layout · motion on|off · performance on|off");
    else if (command === "about" || command === "skills" || command === "experience" || command === "resume" || command === "contact" || command === "terminal") { openWindow(command as AppId); add(`Opening ${command}…`); }
    else if (command === "projects") { openWindow("projects"); add("Opening full project archive…"); }
    else if (command === "projects --featured") { const found = projects.filter((project) => project.featured).map((project) => project.title); add(`Featured: ${found.join(", ")}`); }
    else if (command === "projects --react" || command === "projects --firebase") { const technology = command.endsWith("react") ? "React" : "Firebase"; add(`${technology}: ${projects.filter((project) => project.stack.includes(technology)).map((project) => project.title).join(", ")}`); }
    else if (command.startsWith("open ")) { const target = command.slice(5).replaceAll(" ", "-"); const project = projects.find((item) => item.id === target || item.title.toLowerCase() === target); if (project) { openProject(project); add(`Opening ${project.title} case study…`); } else if (applications.some((app) => app.id === target)) { openWindow(target as AppId); add(`Opening ${target}…`); } else add(`Unknown application: ${target}. Try ‘open projects’.`); }
    else if (command === "whoami") add(`${profile.name} — ${profile.role}. ${profile.focus}`);
    else if (command === "status") add(`${profile.availability}. 10 project archives indexed. Local system ready.`);
    else if (command === "date") add(new Date().toString());
    else if (command === "theme") add("Theme: graphite / amber / warm-white. Motion and performance controls are available.");
    else if (command === "history") add(history.length ? history.join("  ·  ") : "No earlier commands in this session.");
    else if (command === "resume --download") { notify("Resume PDF is not installed. See the Resume app for the expected location.", "warning"); add("Resume download unavailable: final PDF asset has not been installed."); }
    else if (command === "contact --email") add(`Contact email: ${profile.email}`);
    else if (command === "system-info") add("SF-OS / portfolio interface / local deterministic assistant / responsive window manager / no external API required");
    else if (command === "reset-layout") { resetWindowLayout(); add("Window layout reset."); }
    else if (command === "motion on" || command === "motion off") { toggleMotion(); add("Motion preference updated."); }
    else if (command === "performance on" || command === "performance off") { togglePerformance(); add("Performance preference updated."); }
    else if (command === "matrix") { add("Lightweight matrix mode briefly engaged. Green code rain is intentionally omitted to protect the amber system language."); }
    else if (command === "coffee") add("Brew protocol: a thoughtful break, then one crisp commit.");
    else if (command === "fortune") add("Fortune: The detail a user notices is usually the one you were tempted to skip.");
    else if (command === "reboot") { window.sessionStorage.removeItem("sf-os-booted"); add("Reboot sequence is available on the next session refresh."); }
    else if (command === "sudo hire stephen") { openWindow("contact"); add("Permission granted. Opening the transmission console for a very sensible next step."); }
    else add(`Command not found: ${command}. Try ‘help’ or press Tab to autocomplete.`);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") { event.preventDefault(); const next = Math.min(historyIndex + 1, history.length - 1); setHistoryIndex(next); setInput(history[history.length - 1 - next] ?? ""); }
    if (event.key === "ArrowDown") { event.preventDefault(); const next = Math.max(historyIndex - 1, -1); setHistoryIndex(next); setInput(next === -1 ? "" : history[history.length - 1 - next]); }
    if (event.key === "Tab") { event.preventDefault(); const match = commandNames.find((command) => command.startsWith(input.toLowerCase())); if (match) setInput(match); }
  };
  return <div className="terminal-app"><div className="terminal-status"><span><i /> SECURE LOCAL SESSION</span><span>UTF-8 / 80x24</span></div><div className="terminal-output" ref={outputRef} aria-live="polite">{lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div><form className="terminal-input" onSubmit={(event) => { event.preventDefault(); execute(input); setInput(""); }}><span>sf@portfolio:~$</span><label className="sr-only" htmlFor="terminal-command">Terminal command</label><input id="terminal-command" autoComplete="off" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder="Enter command" /><button aria-label="Run terminal command">↵</button></form></div>;
}

function Dock({ windows, selectedApp, onOpen, onFocus }: { windows: WindowState[]; selectedApp: AppId | null; onOpen: (app: AppId) => void; onFocus: (id: WindowId) => void }) {
  const [hovered, setHovered] = useState<AppId | null>(null);
  return <nav className="dock" aria-label="Application dock">{applications.map((app) => { const state = windows.find((window) => window.id === app.id); const active = selectedApp === app.id; return <button key={app.id} className={`${state ? "open" : ""} ${active ? "active" : ""} ${hovered === app.id ? "hovered" : ""}`} onMouseEnter={() => setHovered(app.id)} onMouseLeave={() => setHovered(null)} onClick={() => state ? onFocus(state.id) : onOpen(app.id)} aria-label={`${state?.isMinimized ? "Restore" : "Open"} ${app.label}`}><span>{app.glyph}</span><small>{app.label}</small>{state && <i />}</button>; })}</nav>;
}

function CommandPalette({ query, setQuery, actions, index, setIndex, onClose }: { query: string; setQuery: (value: string) => void; actions: Array<{ label: string; detail: string; action: () => void }>; index: number; setIndex: (value: number) => void; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const execute = (action: { action: () => void }) => { action.action(); onClose(); };
  return <div className="palette-overlay" role="presentation" onMouseDown={onClose}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}><div className="palette-input"><span>⌘</span><label className="sr-only" htmlFor="command-query">Search portfolio commands</label><input ref={inputRef} id="command-query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(index + 1, Math.max(actions.length - 1, 0))); } if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(index - 1, 0)); } if (event.key === "Enter" && actions[index]) execute(actions[index]); }} placeholder="Search applications, projects, and actions…" /><kbd>ESC</kbd></div><div className="palette-list">{actions.length ? actions.slice(0, 8).map((action, actionIndex) => <button key={action.label} className={actionIndex === index ? "selected" : ""} onMouseEnter={() => setIndex(actionIndex)} onClick={() => execute(action)}><span><b>{action.label}</b><small>{action.detail}</small></span><i>↗</i></button>) : <p>No matching commands.</p>}</div></section></div>;
}

function EmptyState({ label }: { label: string }) { return <div className="empty-state">◌<p>{label}</p></div>; }
