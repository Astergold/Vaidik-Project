import { PAGES, type PageId } from "@/lib/sitemap";

/**
 * In-app help (D7-I4-03): 2–4 short tips per page, shown in the top bar's "?" drawer for the current route.
 * Keep in step with docs/user-guide.md. A test makes sure every signed-in page has tips.
 */
export const HELP: Record<Exclude<PageId, `auth.${string}`>, string[]> = {
  "home.dashboard": [
    "Pick a date range; the funnel, temperatures and call stats follow it.",
    "Filters live in the address bar, so you can bookmark or share a view.",
  ],
  "home.workspace": [
    "Start with Needs counsellor — students waiting for a human.",
    "Calls to review: verify or override the AI's label with a quote.",
  ],
  "leads.list": [
    "Search by name, phone digits or email; combine with the filters.",
    "Views → Save current filters to reuse them (managers can share with the team).",
    "Tick rows for the bulk bar: assign, change stage (with a reason), add to campaign, export.",
  ],
  "leads.detail": [
    "Call now checks the calling rules first and tells you why if a call can't happen.",
    "Conversation tab: templates any time; free text only inside the student's 24-hour window.",
    "Add a note after every conversation so the next person has context.",
  ],
  "leads.duplicates": [
    "Compare both records, choose who to keep, then Merge — no call is ever deleted.",
    "Not the same person? Dismiss the pair so it doesn't come back.",
  ],
  "calls.list": [
    "Filter by status or outcome; press Play to hear a recording.",
    "Blocked calls show the rule that stopped them (e.g. OUTSIDE_WINDOW).",
  ],
  "calls.review": [
    "The highlighted text is the AI's quote from the transcript.",
    "Verify if the label is right; Override with the correct label, a reason and a quote.",
  ],
  "campaigns.list": ["Each card shows status and progress; open one to pause or stop it."],
  "campaigns.new": [
    "Choose the agent, which leads (same filters as Leads) and when to call.",
    "The page shows how many leads match right now before you start.",
  ],
  "campaigns.detail": [
    "Progress updates by itself while the campaign runs.",
    "Start and Stop ask you to confirm.",
  ],
  "campaigns.edit": ["You can edit a draft or paused campaign; running ones must be paused first."],
  "visits.calendar": [
    "Month, week and day views of visits, meetings and callbacks.",
    "Click an item to open the lead.",
  ],
  "visits.list": [
    "Mark visits Attended or No-show and add an outcome note.",
    "Filters stay in the address bar.",
  ],
  "visits.meetings": ["Counsellor meetings with students and parents, by status and date."],
  "applications.list": [
    "Press Fee paid to see everyone who has paid.",
    "Rows link to each student's Lead 360.",
  ],
  "applications.import": [
    "Upload the portal export as CSV; your column mapping is remembered.",
    "The preview shows how each row will be matched to a lead before you import.",
  ],
  "applications.unmatched": [
    "Link each row to the right lead (search by phone digits) or dismiss it.",
    "Rows leave the list once the server confirms.",
  ],
  "ai.agents": [
    "Allocate counsellors: they own the leads of that agent.",
    "Switch an agent off to stop new calls from it.",
  ],
  "ai.planner": [
    "Read the planner's reason before approving.",
    "Blocked proposals show the calling rule that stopped them.",
    "With approval on, nothing is sent until someone approves it.",
  ],
  "ai.compliance": [
    "Expect 0 violations each morning.",
    "Each violation links to the lead and says exactly what happened.",
  ],
  "programs.list": [
    "Fees, seat availability, deadlines and eligibility are what the AI agents quote.",
  ],
  "programs.matrix": [
    "Seats are only ever open, limited or closed — never a count.",
    "Admins switch a bucket inline.",
  ],
  "programs.kb": ["Write short, factual articles; the agents answer from them and cite them."],
  "reports.performance": [
    "Choose a period; click a column to order by it.",
    "Overrides show how often the AI's label was corrected.",
  ],
  "reports.exports": [
    "Request a CSV; download it when it shows Ready (files expire after a few days).",
  ],
  "settings.general": ["The timezone drives calling hours and every date in the app."],
  "settings.policy": [
    "Until 21:00 means the last call starts at 20:59.",
    "Changes apply to the very next dial. Holidays block calls all day.",
  ],
  "settings.stages": [
    "Core stages are fixed; add sub-stages under any of them.",
    "A sub-stage in use can't be deleted.",
  ],
  "settings.branding": ["Changes preview across the app instantly; Save or Cancel changes."],
  "settings.domains": [
    "Add the CNAME and TXT records shown, then press Verify now.",
    "HTTPS turns on by itself once verified.",
  ],
  "settings.team": [
    "Invite by email with a role; seats count active people and pending invites.",
    "Allocate counsellors to AI agents at the bottom.",
  ],
  "settings.sources": [
    "Each source gets its own URL and token (shown once).",
    "Use Field mapping to tell us which field is which.",
  ],
  "settings.sourcesImport": [
    "Upload → map columns → preview → import; download the error report if rows fail.",
  ],
  "settings.integrations": [
    "API keys and webhook secrets are shown once — copy them straight away.",
    "Send test, then check the delivery log.",
  ],
  "settings.whatsapp": [
    "Map each template variable to a lead field so it fills itself.",
    "The API key is write-only.",
  ],
  "settings.email": [
    "Add the DNS records shown, then Check again; emails send from your domain once verified.",
  ],
  "settings.llm": [
    "Your own key is optional; without one the platform key is used.",
    "Extraction rules add fields to every call's analysis.",
  ],
  "settings.billing": [
    "Calls and messages stop at ₹0 (WALLET_EMPTY) until topped up.",
    "Statements download as CSV or PDF.",
  ],
  "settings.privacy": [
    "Erasure removes personal data but keeps billing totals; it can't be undone.",
  ],
  "platform.tenants": [
    "Suspend blocks logins and dials; impersonation needs a reason and lasts 30 minutes.",
  ],
  "platform.newTenant": ["One screen, then review. The owner gets an invite email."],
  "platform.plans": ["Prices are in rupees and stored exactly in paise."],
  "platform.health": [
    "Refreshes every 30 seconds. A non-zero difference in sync health needs a look.",
  ],
  "platform.audit": ["Impersonated actions name both the user and the super-admin."],
  "system.notifications": ["Click a notification to open it; Mark all read clears the bell."],
  "system.profile": [
    "Tick 'sign out my other devices' when you change your password on a shared computer.",
  ],
};

const PATTERNS = (Object.entries(PAGES) as [PageId, (typeof PAGES)[PageId]][])
  .filter(([id]) => !id.startsWith("auth."))
  .map(([id, p]) => ({
    id,
    params: (p.path.match(/\$/g) ?? []).length,
    re: new RegExp(`^${p.path.replace(/\$[^/]+/g, "[^/]+")}/?$`),
  }))
  // Static paths win over parameter paths: /leads/duplicates is not a lead id.
  .sort((a, b) => a.params - b.params);

/** The sitemap page for a pathname, or null (404 / auth pages). */
export function pageForPath(pathname: string): Exclude<PageId, `auth.${string}`> | null {
  const hit = PATTERNS.find((p) => p.re.test(pathname));
  return (hit?.id as Exclude<PageId, `auth.${string}`> | undefined) ?? null;
}
