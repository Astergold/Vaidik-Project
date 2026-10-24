import { ROLES, type Role } from "@vernacular/contracts";
import type { FileRoutesByTo } from "@/routeTree.gen";

/**
 * Handbook Appendix B in one place: every page, who sees it, and which task builds it (D1-I4-04).
 * The sidebar, PlaceholderPage and the route test all read this. Roles here only shape the UI;
 * the API enforces every permission.
 */

/** UI-only viewer role. `super_admin` = platform admin with no tenant membership (impersonation is D6). */
export type ViewerRole = Role | "super_admin";
export const VIEWER_ROLES = ["super_admin", ...ROLES] as const satisfies readonly ViewerRole[];
export const ROLE_LABELS: Record<ViewerRole, string> = {
  super_admin: "Super-admin",
  owner: "Owner",
  admin: "Admin",
  admission_head: "Admission head",
  counsellor: "Counsellor",
};

export const AREAS = [
  "Auth",
  "Home",
  "Leads",
  "Calls",
  "Campaigns",
  "Visits & calendar",
  "Applications",
  "AI",
  "Programs",
  "Reports",
  "Settings",
  "Platform",
  "System",
] as const;
export type Area = (typeof AREAS)[number];

export type AppPath = keyof FileRoutesByTo;

export interface PageDef {
  title: string;
  area: Area;
  path: AppPath;
  roles: readonly ViewerRole[];
  /** What the real page will do, and the task that builds it. */
  builds: string;
  /** false = reachable from a parent page, not listed in the sidebar. */
  nav?: boolean;
  parent?: string;
  /** Concrete URL for pages with params, used for "related pages" links. */
  sampleHref?: string;
}

const EVERYONE = VIEWER_ROLES;
const TENANT = ROLES;
const MANAGERS = ["owner", "admin", "admission_head"] as const;
const SETTINGS = ["owner", "admin"] as const;
const PLATFORM = ["super_admin"] as const;

const page = (def: PageDef) => def;

// prettier-ignore
export const PAGES = {
  "auth.login": page({ title: "Sign in", area: "Auth", path: "/login", roles: EVERYONE, nav: false, builds: "Email/password + Google sign-in (D2-I4-02)." }),
  "auth.forgot": page({ title: "Forgot password", area: "Auth", path: "/forgot-password", roles: EVERYONE, nav: false, builds: "Request a reset link by email (D2-I4-02)." }),
  "auth.reset": page({ title: "Reset password", area: "Auth", path: "/reset-password", roles: EVERYONE, nav: false, builds: "Set a new password from the emailed link (D2-I4-02)." }),
  "auth.invite": page({ title: "Accept invitation", area: "Auth", path: "/accept-invitation/$invitationId", roles: EVERYONE, nav: false, builds: "Join a team from the emailed invite link (D2-I4-02; invitee sign-up D6)." }),

  "home.dashboard": page({ title: "Dashboard", area: "Home", path: "/dashboard", roles: MANAGERS, builds: "Funnel by stage, temperature split, call stats, by source and agent (D2-I4-04, D3-I4-02)." }),
  "home.workspace": page({ title: "My workspace", area: "Home", path: "/workspace", roles: ["counsellor"], builds: "Needs counsellor, review calls, my leads and today's queue (D4-I4-01)." }),

  "leads.list": page({ title: "Leads", area: "Leads", path: "/leads", roles: TENANT, builds: "Person-centric table with filters, saved views and bulk actions (D2-I4-03, D6-I4-04)." }),
  "leads.detail": page({ title: "Lead 360", area: "Leads", path: "/leads/$leadId", roles: TENANT, nav: false, parent: "leads.list", sampleHref: "/leads/sample-lead", builds: "Identity, stage, timeline, calls and actions (D3-I4-01)." }),
  "leads.duplicates": page({ title: "Duplicates", area: "Leads", path: "/leads/duplicates", roles: TENANT, builds: "Review and merge suspected duplicate people (D6-I4-04)." }),

  "calls.list": page({ title: "Calls", area: "Calls", path: "/calls", roles: TENANT, builds: "Every call with outcome, recording and filters (D6-I4-04e)." }),
  "calls.review": page({ title: "Review queue", area: "Calls", path: "/calls/review", roles: TENANT, builds: "Verify or override AI labels with quotes (D4-I4-01)." }),

  "campaigns.list": page({ title: "Campaigns", area: "Campaigns", path: "/campaigns", roles: MANAGERS, builds: "Campaign list with status and progress (D3-I4-04)." }),
  "campaigns.new": page({ title: "New campaign", area: "Campaigns", path: "/campaigns/new", roles: MANAGERS, nav: false, parent: "campaigns.list", sampleHref: "/campaigns/new", builds: "Agent, audience filter, schedule and daily cap (D3-I4-04)." }),
  "campaigns.detail": page({ title: "Campaign", area: "Campaigns", path: "/campaigns/$campaignId", roles: MANAGERS, nav: false, parent: "campaigns.list", sampleHref: "/campaigns/sample-campaign", builds: "Live progress, pause and stop (D3-I4-04)." }),
  "campaigns.edit": page({ title: "Edit campaign", area: "Campaigns", path: "/campaigns/$campaignId/edit", roles: MANAGERS, nav: false, parent: "campaigns.detail", sampleHref: "/campaigns/sample-campaign/edit", builds: "Change audience, schedule and cap (D3-I4-04)." }),

  "visits.calendar": page({ title: "Calendar", area: "Visits & calendar", path: "/calendar", roles: TENANT, builds: "Visits, meetings and callbacks on a calendar (D4-I4-02)." }),
  "visits.list": page({ title: "Campus visits", area: "Visits & calendar", path: "/visits", roles: TENANT, builds: "Book, reschedule, mark attended or no-show (D4-I4-02)." }),
  "visits.meetings": page({ title: "Meetings", area: "Visits & calendar", path: "/meetings", roles: TENANT, builds: "Counsellor meetings with students and parents (D4-I4-02)." }),

  "applications.list": page({ title: "Applications", area: "Applications", path: "/applications", roles: MANAGERS, builds: "Applications with status and fee-paid filters (D5-I4-01)." }),
  "applications.import": page({ title: "Import applications", area: "Applications", path: "/applications/import", roles: MANAGERS, builds: "Upload, map, preview and import (D5-I4-01)." }),
  "applications.unmatched": page({ title: "Unmatched", area: "Applications", path: "/applications/unmatched", roles: MANAGERS, builds: "Applications we could not match to a lead (D5-I4-01)." }),

  "ai.agents": page({ title: "AI agents", area: "AI", path: "/ai/agents", roles: MANAGERS, builds: "Agents, language, allocated counsellors, active toggle (D4-I4-04)." }),
  "ai.planner": page({ title: "Planner approvals", area: "AI", path: "/ai/planner", roles: MANAGERS, builds: "Approve or reject proposed outreach (D6-I4-04)." }),
  "ai.compliance": page({ title: "Compliance report", area: "AI", path: "/ai/compliance", roles: MANAGERS, builds: "Calling-hours, consent and DND compliance (D6-I4-04)." }),

  "programs.list": page({ title: "Programs", area: "Programs", path: "/programs", roles: MANAGERS, builds: "Fees, seats, deadlines and eligibility (D4-I4-03)." }),
  "programs.matrix": page({ title: "Seats & deadlines", area: "Programs", path: "/programs/matrix", roles: MANAGERS, builds: "Seat and deadline matrix across programs (D6-I4-04)." }),
  "programs.kb": page({ title: "Knowledge base", area: "Programs", path: "/programs/knowledge-base", roles: MANAGERS, builds: "Markdown articles the AI agents answer from (D4-I4-03)." }),

  "reports.performance": page({ title: "Counsellor performance", area: "Reports", path: "/reports/performance", roles: MANAGERS, builds: "Calls reviewed, queue resolved, visits booked, conversions (D6-I4-04)." }),
  "reports.exports": page({ title: "Exports", area: "Reports", path: "/reports/exports", roles: MANAGERS, builds: "Download leads, calls and applications as CSV (D6-I4-04)." }),

  "settings.general": page({ title: "General", area: "Settings", path: "/settings", roles: SETTINGS, builds: "Institution name, timezone, admission cycle (D6-I4-02)." }),
  "settings.policy": page({ title: "Policy & holidays", area: "Settings", path: "/settings/policy", roles: SETTINGS, builds: "Calling hours, attempt limits and holidays (D6-I4-02)." }),
  "settings.stages": page({ title: "Stages & sub-stages", area: "Settings", path: "/settings/stages", roles: SETTINGS, builds: "Sub-stages under each core stage (D6-I4-02)." }),
  "settings.branding": page({ title: "Branding", area: "Settings", path: "/settings/branding", roles: SETTINGS, builds: "Logo, colour and product name with live preview (D6-I4-02)." }),
  "settings.domains": page({ title: "Domains", area: "Settings", path: "/settings/domains", roles: SETTINGS, builds: "Custom domain and verification status (D6-I4-02)." }),
  "settings.team": page({ title: "Team", area: "Settings", path: "/settings/team", roles: SETTINGS, builds: "Invite people, set roles and allocation (D6-I4-02)." }),
  "settings.sources": page({ title: "Lead sources", area: "Settings", path: "/settings/lead-sources", roles: MANAGERS, builds: "Intake endpoints, tokens, field mapping (D3-I4-03); heads read-only. CSV import wizard follows." }),
  "settings.sourcesImport": page({ title: "Import leads (CSV)", area: "Settings", path: "/settings/lead-sources/import", roles: SETTINGS, nav: false, parent: "settings.sources", sampleHref: "/settings/lead-sources/import", builds: "Upload → map → preview → import → error report (D3-I4-03b; backend D3-I3-03 pending)." }),
  "settings.integrations": page({ title: "Integrations", area: "Settings", path: "/settings/integrations", roles: SETTINGS, builds: "API keys, webhooks and delivery log (D5-I4-03)." }),
  "settings.whatsapp": page({ title: "WhatsApp", area: "Settings", path: "/settings/whatsapp", roles: SETTINGS, builds: "WhatsApp sender, synced templates and variable mapping (D5-I4-02)." }),
  "settings.email": page({ title: "Email sender", area: "Settings", path: "/settings/email", roles: SETTINGS, builds: "Sender name and address for emails (D6-I4-02)." }),
  "settings.llm": page({ title: "LLM provider", area: "Settings", path: "/settings/llm", roles: SETTINGS, builds: "Model provider and key for call analysis (D6-I4-02)." }),
  "settings.billing": page({ title: "Billing", area: "Settings", path: "/settings/billing", roles: SETTINGS, builds: "Wallet, usage, plan and statements (D6-I4-03)." }),
  "settings.privacy": page({ title: "Data & privacy", area: "Settings", path: "/settings/privacy", roles: SETTINGS, builds: "Retention, person export and erasure (UI D6-I4-02; API D7-I2-01)." }),

  "platform.tenants": page({ title: "Tenants", area: "Platform", path: "/platform/tenants", roles: PLATFORM, builds: "Tenants with status, plan, usage and wallet (D6-I4-01)." }),
  "platform.newTenant": page({ title: "Create tenant", area: "Platform", path: "/platform/tenants/new", roles: PLATFORM, nav: false, parent: "platform.tenants", sampleHref: "/platform/tenants/new", builds: "Create a tenant in under 10 minutes (D6-I4-01)." }),
  "platform.plans": page({ title: "Plans", area: "Platform", path: "/platform/plans", roles: PLATFORM, builds: "Plan editor (D6-I4-01)." }),
  "platform.health": page({ title: "Health", area: "Platform", path: "/platform/health", roles: PLATFORM, builds: "Sync health, queue depth and errors (D6-I4-01)." }),
  "platform.audit": page({ title: "Audit log", area: "Platform", path: "/platform/audit-log", roles: PLATFORM, builds: "Who changed what, across tenants (D6-I4-01)." }),

  "system.notifications": page({ title: "Notifications", area: "System", path: "/notifications", roles: EVERYONE, builds: "Everything that needs your attention (D6-I4-04)." }),
  "system.profile": page({ title: "Profile", area: "System", path: "/profile", roles: EVERYONE, builds: "Your name, password and preferences (D6-I4-02)." }),
} satisfies Record<string, PageDef>;

export type PageId = keyof typeof PAGES;
const ALL_PAGES = Object.entries(PAGES) as [PageId, PageDef][];

/** Auth pages render in the centred card, outside the app shell. `$param` segments match one segment. */
const AUTH_PATTERNS = ALL_PAGES.filter(([, p]) => p.area === "Auth").map(
  ([, p]) => new RegExp(`^${p.path.replace(/\$[^/]+/g, "[^/]+")}/?$`),
);
export const isAuthPath = (pathname: string): boolean =>
  AUTH_PATTERNS.some((re) => re.test(pathname));

export function canView(def: PageDef, role: ViewerRole): boolean {
  return def.roles.includes(role);
}

export interface NavGroup {
  area: Area;
  items: PageDef[];
}

/** Sidebar groups for a role, in Appendix B order. */
export function navFor(role: ViewerRole): NavGroup[] {
  return AREAS.map((area) => ({
    area,
    items: ALL_PAGES.map(([, p]) => p).filter(
      (p) => p.area === area && p.nav !== false && canView(p, role),
    ),
  })).filter((g) => g.items.length > 0);
}

export function childrenOf(id: PageId): PageDef[] {
  return ALL_PAGES.filter(([, p]) => p.parent === id).map(([, p]) => p);
}

/** Where `/` sends each role. */
export function homeFor(role: ViewerRole): AppPath {
  if (role === "super_admin") return "/platform/tenants";
  return role === "counsellor" ? "/workspace" : "/dashboard";
}
