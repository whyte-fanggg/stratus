export type AppId =
  | "about"
  | "projects"
  | "skills"
  | "experience"
  | "resume"
  | "contact"
  | "terminal";

export type ProjectStatus = "live" | "in-progress" | "archived";

export interface Project {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: "Full-stack" | "Product" | "Data" | "Creative UI";
  featured: boolean;
  status: ProjectStatus;
  stack: string[];
  features: string[];
  challenge: string;
  outcome: string;
  accent: string;
}

export const profile = {
  name: "Stephen",
  role: "Full-stack Web Developer",
  location: "Ontario, Canada",
  availability: "Available for opportunities",
  focus: "React products, polished interface systems, and useful web platforms.",
  email: "hello@stephenfolio.dev",
  philosophy:
    "The best product interfaces make complex work feel obvious: deliberate systems, generous feedback, and a little unexpected delight.",
};

export const applications: Array<{
  id: AppId;
  label: string;
  glyph: string;
  status: string;
}> = [
  { id: "about", label: "About", glyph: "◈", status: "IDENTITY" },
  { id: "projects", label: "Projects", glyph: "▦", status: "ARCHIVE" },
  { id: "skills", label: "Skills", glyph: "◌", status: "MATRIX" },
  { id: "experience", label: "Experience", glyph: "↗", status: "TIMELINE" },
  { id: "resume", label: "Resume", glyph: "▤", status: "DOSSIER" },
  { id: "contact", label: "Contact", glyph: "◒", status: "UPLINK" },
  { id: "terminal", label: "Terminal", glyph: "›_", status: "CONSOLE" },
];

export const projects: Project[] = [
  {
    id: "localharvest",
    title: "LocalHarvest",
    subtitle: "A micro-marketplace for local food",
    description: "Connects growers with nearby buyers through a thoughtful reservation and pickup flow.",
    category: "Full-stack",
    featured: true,
    status: "live",
    stack: ["React", "Vite", "TypeScript", "Tailwind CSS", "Framer Motion", "Firebase", "Clerk", "React Router", "Vercel"],
    features: ["Listings CRUD", "Image uploads", "Reservations", "Quantity decrement", "My Reservations", "Orders Received", "Pickup status", "SEO metadata"],
    challenge: "Make a local marketplace feel trustworthy while keeping the seller and buyer flows lightweight.",
    outcome: "A clear inventory-to-pickup lifecycle that gives both sides confidence in every handoff.",
    accent: "#d99d2b",
  },
  {
    id: "lunaria",
    title: "Lunaria",
    subtitle: "Mood, music, and reflection journal",
    description: "A calming daily space for capturing feelings, songs, and the patterns that connect them.",
    category: "Product",
    featured: true,
    status: "live",
    stack: ["React", "Vite", "TypeScript", "Tailwind CSS", "Framer Motion", "Firebase", "React Router", "Vercel"],
    features: ["Mood cards", "Song and note journaling", "Emoji tooltips", "Pie chart", "Filters", "Onboarding modal"],
    challenge: "Keep personal data entry inviting without making reflective practice feel like a form.",
    outcome: "A soft, glanceable journaling system that turns small daily entries into meaningful context.",
    accent: "#c88ab0",
  },
  {
    id: "codelore",
    title: "CodeLore",
    subtitle: "Code snippets with narrative context",
    description: "A snippet manager that preserves the reasoning around code, not just the code itself.",
    category: "Full-stack",
    featured: true,
    status: "live",
    stack: ["React", "Vite", "TypeScript", "Tailwind CSS", "Framer Motion", "Firebase", "Zustand", "React Router", "Vercel"],
    features: ["Snippet CRUD", "Code language", "Tags", "Markdown notes", "Public and private snippets", "Authentication"],
    challenge: "Give developers a quick capture flow while making old snippets useful weeks later.",
    outcome: "An organised, privacy-aware library where implementation detail and technical story live together.",
    accent: "#e0b14f",
  },
  {
    id: "taskbento",
    title: "Taskbento",
    subtitle: "A tactile task manager",
    description: "Visual task planning with a bento layout, clay-like depth, and drag-friendly organisation.",
    category: "Creative UI",
    featured: false,
    status: "live",
    stack: ["React", "Vite", "TypeScript", "Styled Components", "Framer Motion", "dnd-kit", "Firebase", "Vercel"],
    features: ["Add, edit, and delete tasks", "Drag and drop", "Modal forms", "Coloured task tiles", "Responsive interface"],
    challenge: "Balance expressive visual design with the speed a daily planning tool needs.",
    outcome: "A flexible, touch-friendly workspace that makes organising work feel physical and clear.",
    accent: "#d07c57",
  },
  {
    id: "globequest",
    title: "GlobeQuest",
    subtitle: "Country and weather explorer",
    description: "An exploratory interface for learning about countries and checking their capital weather.",
    category: "Data",
    featured: false,
    status: "live",
    stack: ["React", "Vite", "TypeScript", "Tailwind CSS", "Framer Motion", "REST Countries API", "OpenWeather API"],
    features: ["Country search", "Flag", "Region", "Population", "Languages", "Currencies", "Borders", "Capital weather"],
    challenge: "Combine several dense data sources into one effortless, curiosity-led search experience.",
    outcome: "A map-adjacent explorer that turns reference data into a lively, useful discovery flow.",
    accent: "#74ad8b",
  },
  {
    id: "zenaura",
    title: "Zenaura",
    subtitle: "An origami-inspired focus ritual",
    description: "A Pomodoro timer designed around calm pacing, gentle prompts, and spoken reflection.",
    category: "Creative UI",
    featured: false,
    status: "in-progress",
    stack: ["React", "Vite", "TypeScript", "CSS", "Framer Motion", "Firebase", "AssemblyAI"],
    features: ["5, 25, and 50-minute presets", "Quotes", "Audio playback", "Notifications", "Speech-to-text transcription"],
    challenge: "Create a productivity tool that supports focus without becoming another source of pressure.",
    outcome: "A quiet ritual interface with deliberate choices for beginning, sustaining, and reflecting on focus.",
    accent: "#bd8fdb",
  },
  {
    id: "silent-auction-hub",
    title: "Silent Auction Hub",
    subtitle: "Real-time bidding with durable rules",
    description: "A full-stack silent auction platform built for auction owners, bidders, and clear results.",
    category: "Full-stack",
    featured: true,
    status: "live",
    stack: ["React", "Vite", "TypeScript", "Tailwind CSS", "Supabase", "React Router", "Vercel"],
    features: ["Authentication", "Auctions", "Items", "Bids", "Row-level security", "Protected routes", "Admin results", "Creator ownership", "Real-time bidding"],
    challenge: "Make concurrent bidding legible while protecting ownership and administrative controls.",
    outcome: "A secure, real-time auction workflow with the boundaries and feedback a live event needs.",
    accent: "#de9a4d",
  },
  {
    id: "smart-expense-tracker",
    title: "Smart Expense Tracker",
    subtitle: "Personal budgets made legible",
    description: "A clean expense dashboard for recording spending, anticipating budget risk, and exporting data.",
    category: "Data",
    featured: false,
    status: "live",
    stack: ["React", "TypeScript", "Vite", "Tailwind CSS", "Chart.js", "LocalStorage"],
    features: ["Add, edit, and delete expenses", "Budget alerts", "Filters", "CSV export", "Pie chart", "Three-column layout"],
    challenge: "Present financial signals without making an everyday tool feel overwhelming.",
    outcome: "A practical dashboard that keeps spending data actionable and easy to export.",
    accent: "#cf7449",
  },
  {
    id: "brain-sprint",
    title: "Brain Sprint",
    subtitle: "Fast, focused mental challenges",
    description: "A 60-second challenge suite that layers timers, difficulty, daily seeds, and keyboard play.",
    category: "Product",
    featured: false,
    status: "live",
    stack: ["React", "TypeScript", "Tailwind CSS", "Framer Motion", "Zustand", "Vite", "LocalStorage"],
    features: ["Quick Math", "Colour Match", "Memory Flip", "Difficulty levels", "Timers", "Daily seed", "Keyboard shortcuts", "Results dashboard", "Tutorial modal"],
    challenge: "Keep very short sessions meaningful while preserving a satisfying loop of mastery.",
    outcome: "A kinetic, keyboard-aware game system built around instant feedback and replay value.",
    accent: "#e4a841",
  },
  {
    id: "ui-library",
    title: "UI Library",
    subtitle: "Reusable React component system",
    description: "A component library with live previews, variants, code views, and useful copy workflows.",
    category: "Creative UI",
    featured: true,
    status: "live",
    stack: ["React", "TypeScript", "Vite", "Tailwind CSS", "Framer Motion", "React Syntax Highlighter", "Lucide React"],
    features: ["Component previews", "Code toggle", "Copy button", "Variants", "Grid cards", "Navigation sidebar"],
    challenge: "Show implementation detail without overwhelming someone who just wants to evaluate a component.",
    outcome: "A polished reference surface that makes reuse, inspection, and iteration straightforward.",
    accent: "#d5be70",
  },
];

export const skillGroups = [
  { label: "Interface systems", skills: ["React", "TypeScript", "Tailwind CSS", "CSS architecture", "Accessibility", "Motion design"] },
  { label: "Product engineering", skills: ["Firebase", "Supabase", "REST APIs", "Authentication", "Data modelling", "SEO"] },
  { label: "Working practice", skills: ["Figma handoff", "Git workflows", "Performance", "Testing mindset", "Responsive design", "Technical writing"] },
];

export const experience = [
  { period: "Now", title: "Full-stack Web Developer", place: "Independent product work", detail: "Designing and shipping responsive web products from interface system through data flow and deployment." },
  { period: "2024–2026", title: "Web Development Student", place: "St. Clair College", detail: "Deepened full-stack foundations through product-focused builds, collaboration, and iterative critique." },
  { period: "Ongoing", title: "Interface Systems Explorer", place: "Open-source & self-directed", detail: "Building component patterns and interactive prototypes that turn ambitious concepts into approachable products." },
];

export const education = [
  { title: "Web Development and Internet Applications", meta: "St. Clair College · Ontario" },
  { title: "Focused study", meta: "Accessible UI engineering, full-stack JavaScript, and product interaction design" },
];
