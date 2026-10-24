# Vernacular AI — user guide

For MIT-ADT admissions staff. Each section is a workflow: where to click and what you'll see. Press **?** in the top bar
on any page for short tips about that page; press **Ctrl+K** (⌘K on Mac) anywhere to find a student or jump to a page.

> **While we finish the back office:** some pages say "… service not available yet". That means the screen is ready
> but its server feature is still being switched on — nothing is broken and nothing is shown that isn't real.

## Who sees what

| Role           | Home page    | Can                                                                                                   |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| Owner / Admin  | Dashboard    | Everything for the institution: settings, team, billing, integrations, AI agents, programs, campaigns |
| Admission head | Dashboard    | All leads, campaigns, applications, planner approvals, reports; reads settings like lead sources      |
| Counsellor     | My workspace | Their own leads (allocated AI agents or assigned to them), calls, reviews, visits, meetings           |

Phone numbers are shortened to the last digits for counsellors. That's done by the server, on purpose.

---

## Admins (owner / admin)

### 1. Set the calling rules — Settings → Policy & holidays

1. Set **From / Until** (your timezone; "Until 21:00" means the last call starts at 20:59) and tick the **Days**.
2. Set **Max calls per day / in total** and the **Minimum gap**.
3. Keep **Require consent** and **Check the NDNC registry** on. Write the **AI disclosure** the agent says first.
4. **Save policy** — it applies to the very next dial. Add **Holidays** below (no calls on those dates).

### 2. Connect a lead source — Settings → Lead sources

1. **New source**, pick its type, choose the default program/agent and whether to call new leads automatically.
2. Copy the **endpoint URL and token** shown once and give them to the form or lead provider.
3. Use **Field mapping** to tell us which field is the name, phone, email… and test it with a sample payload.
4. For spreadsheets: **Import CSV** → upload → map columns → preview → import → download the error report if any.

### 3. Set up an AI agent — AI → Agents

1. **New agent**: name (what students hear), language, voice, and a voice template.
2. **Allocate counsellors** — they own that agent's leads. Switch the agent **Active** when ready.

### 4. Run a campaign — Campaigns

1. **New campaign**: agent, which leads (the same filters as the Leads list — the page shows how many match now),
   days and calling window, daily cap.
2. **Start** (confirm). **Pause** at lunch, **Resume**, **Stop** when done. Progress updates by itself.

### 5. Brand, domain and team — Settings

- **Branding**: change name, colour, logo — the whole app previews instantly; **Save** or **Cancel changes**.
- **Domains**: add `admissions.yourcollege.edu`, add the CNAME and TXT records shown, press **Verify now**; HTTPS turns
  on automatically.
- **Team**: invite by email with a role, change roles, deactivate leavers; **Counsellor allocation** at the bottom.
- **Email sender**, **LLM provider** (+ custom fields to extract from calls), **WhatsApp** sender and template
  variables, **Integrations** (API keys shown once, webhooks with test + delivery log), **Billing** (balance — calls stop
  at ₹0 — usage and statements), **Data & privacy** (retention, export or erase one person).

## Admission heads

### 1. Morning check — Dashboard

Funnel by stage, temperature split, calls, by source and agent. Pick a date range; filters stay in the address bar.

### 2. Work the list — Leads

1. Filter by stage, temperature, source, agent, counsellor, dates or search. **Views → Save current filters** to reuse
   (tick **Share** for the team).
2. Tick rows (or **Select all N matching**) and use the bar at the bottom: **Assign**, **Change stage** (a reason is
   required and recorded on every lead), **Add to campaign**, **Export** (file appears in Reports → Exports).
3. **Leads → Duplicates**: compare two records side by side, pick who to keep, **Merge** (no call is lost) or
   **Not the same person**.

### 3. Approve AI follow-ups — AI → Planner approvals

Read each proposal's reason, then **Approve**, **Reject** (with a reason) or tick several and approve them together.
Blocked proposals show the rule that stopped them (e.g. `OUTSIDE_WINDOW`). **AI → Compliance report** should read
**0 violations** each morning.

### 4. Applications and fees — Applications

**Fee paid** shows who has paid (two clicks from anywhere). **Import** the portal export; **Unmatched** lists rows we
couldn't tie to a lead — **Link to lead** or **Dismiss**. Each lead's page shows its applications too.

### 5. Reports

**Counsellor performance** (reviews, overrides, queue work, visits, conversions) and **Exports** (CSV of leads, calls or
applications; download when Ready).

## Counsellors

### 1. Start of day — My workspace

**Needs counsellor** (students asking for a human), **Calls to review**, today's visits and meetings, your leads.

### 2. Review an AI call — Calls → Review queue

Open a call, listen, read the transcript (the AI's quote is highlighted). **Verify** if the label is right; **Override**
with the correct temperature, a reason and a quote if not.

### 3. Work a lead — Lead 360

- Header: stage (change it with a reason), temperature, next step.
- **Call now** asks the calling rules first; if a call isn't allowed you'll see why and when it can happen.
- **Timeline** tab: everything that happened. **Conversation** tab: WhatsApp — send an approved **template** any time
  (check the preview), and free text only while the student's 24-hour reply window is open. A **STOP** badge means
  the student opted out: no messages or calls.
- Side panel: details, **Applications** (status, fee, paid date), **Visits & meetings** (Book visit / Meeting).
- Add a **note** after every conversation.

### 4. Visits and meetings — Calendar / Campus visits / Meetings

Book, reschedule, mark **Attended** or **No-show** with a note.

---

## Everyone

- **Notifications** (bell): overdue follow-ups, students asking for a counsellor, calls to review. Click to open; **Mark
  all read**.
- **Profile**: change your name and password (tick "sign out my other devices" if you share computers).
- Help: **?** in the top bar. Problems: tell your admin, with the page address from the browser.
