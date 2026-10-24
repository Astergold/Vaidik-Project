import type { PolicyDecision, PolicyRejectCode } from "@vernacular/contracts";
import type { Channel, PolicyAction, PolicyFacts } from "./types.js";
import { addDaysToDateKey, isoWeekdayOf, localParts, parseClock, zonedTimeToUtc } from "./tz.js";

const MINUTE = 60_000;
/** How far ahead we search for the next allowed day (a year of holidays still terminates). */
const MAX_DAYS_AHEAD = 370;

const reject = (code: PolicyRejectCode, retryAt?: Date): PolicyDecision =>
  retryAt ? { allow: false, code, retryAt } : { allow: false, code };

/**
 * First instant strictly after `now` at which the calling window opens, looking from
 * `fromDay` local days ahead (0 = today). undefined if no allowed day exists in the next year.
 */
function nextWindowOpen(facts: PolicyFacts, now: Date, fromDay: number): Date | undefined {
  const { timeZone, policy, holidays } = {
    timeZone: facts.tenant.timezone,
    policy: facts.policy,
    holidays: facts.holidays,
  };
  const startMin = parseClock(policy.callWindowStart);
  const today = localParts(now, timeZone).dateKey;
  for (let i = fromDay; i <= MAX_DAYS_AHEAD; i++) {
    const key = addDaysToDateKey(today, i);
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    if (!policy.allowedDays.includes(isoWeekdayOf(y, m, d)) || holidays.includes(key)) continue;
    const opens = zonedTimeToUtc(y, m, d, Math.floor(startMin / 60), startMin % 60, timeZone);
    if (opens.getTime() > now.getTime()) return opens;
  }
  return undefined;
}

function checkWindow(facts: PolicyFacts, now: Date): PolicyDecision | null {
  const { policy, holidays, tenant } = facts;
  const startMin = parseClock(policy.callWindowStart);
  const endMin = parseClock(policy.callWindowEnd);
  if (startMin >= endMin) return reject("OUTSIDE_WINDOW"); // misconfigured window: never dial, no retry time
  const lp = localParts(now, tenant.timezone);
  const dayAllowed = policy.allowedDays.includes(lp.isoWeekday) && !holidays.includes(lp.dateKey);
  if (dayAllowed && lp.minutesOfDay >= startMin && lp.minutesOfDay < endMin) return null;
  return reject("OUTSIDE_WINDOW", nextWindowOpen(facts, now, 0));
}

/**
 * The gatekeeper (handbook §7.3). Pure: no I/O, no clock reads, no randomness.
 * Rules run in a fixed order and the FIRST failure wins, so the reject code is deterministic.
 *
 *  1 tenant active · 2 wallet · 3 suppression · 4 NDNC · 5 consent · 6 window/day/holiday ·
 *  7 attempt caps · 8 minimum gap · 9 promotional caller-id · 10 call already active
 *
 * Voice-only rules: 4, 7, 8, 9, 10. WhatsApp "transactional" messages (e.g. visit reminders) skip rule 6.
 * `planner` is evaluated as the channel the proposed action would use.
 */
export function evaluate(action: PolicyAction, facts: PolicyFacts, now: Date): PolicyDecision {
  const { tenant, policy, wallet } = facts;
  const channel: Channel =
    action === "dial"
      ? "voice"
      : action === "whatsapp"
        ? "whatsapp"
        : (facts.plannerChannel ?? "voice");
  const voice = channel === "voice";
  const transactional = channel === "whatsapp" && facts.transactional === true;

  // 1
  if (tenant.status !== "active") return reject("TENANT_SUSPENDED");
  // 2
  if (wallet.mode === "prepaid" && wallet.balance <= 0) return reject("WALLET_EMPTY");
  // 3
  if (facts.suppressed) return reject("SUPPRESSED");
  // 4
  if (voice && policy.ndncCheck) {
    if (facts.ndnc === "listed") return reject("NDNC_LISTED");
    if (facts.ndnc === "unknown") return reject("NDNC_UNKNOWN");
  }
  // 5
  if (policy.requireConsent && facts.consent !== "granted") return reject("NO_CONSENT");
  // 6
  if (!transactional) {
    const w = checkWindow(facts, now);
    if (w) return w;
  }

  if (voice) {
    // 7
    if (facts.attempts.total >= policy.maxAttemptsTotal) return reject("CAP_REACHED");
    if (facts.attempts.today >= policy.maxAttemptsPerDay) {
      return reject("CAP_REACHED", nextWindowOpen(facts, now, 1)); // try again tomorrow (next allowed day)
    }
    // 8
    const last = facts.attempts.lastAttemptAt;
    if (last) {
      const earliest = last.getTime() + policy.minGapMinutes * MINUTE;
      if (now.getTime() < earliest) return reject("TOO_SOON", new Date(earliest));
    }
    // 9
    if (facts.promotional && policy.promoRequires140 && !facts.callerId140) {
      return reject("PROMO_NUMBER_REQUIRED");
    }
    // 10
    if (facts.activeCall) return reject("CALL_IN_PROGRESS");
  }

  return { allow: true };
}
