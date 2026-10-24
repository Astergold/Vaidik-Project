import { WEBHOOK_EVENTS, type WebhookDelivery, type WebhookEvent } from "@vernacular/contracts";

/** Webhook form helpers (D5-I4-03). Pure, so they are unit-tested. */
export const EVENT_LABEL: Record<WebhookEvent, string> = {
  "lead.created": "A new lead arrives",
  "lead.stage_changed": "A lead moves stage",
  "call.completed": "An AI call ends",
  "analysis.ready": "A call's analysis is ready",
  "visit.booked": "A campus visit is booked",
  "visit.attended": "A visit is marked attended",
  "application.updated": "An application changes status",
  "counsellor.requested": "A student asks for a counsellor",
};

/** Toggle one event, keeping the contract's order (stable payloads, stable diffs). */
export const toggleEvent = (selected: readonly WebhookEvent[], e: WebhookEvent, on: boolean) =>
  WEBHOOK_EVENTS.filter((x) => (x === e ? on : selected.includes(x)));

/** Delivery outcome in one line: "200 · 120 ms", "Timed out after 10 s", "Retrying (attempt 3)". */
export function deliverySummary(d: WebhookDelivery): string {
  const code = d.statusCode !== null ? `HTTP ${d.statusCode}` : null;
  const time = d.durationMs !== null ? `${d.durationMs} ms` : null;
  if (d.status === "succeeded") return [code, time].filter(Boolean).join(" · ") || "Delivered";
  if (d.status === "pending") return "Sending…";
  const why = d.error ?? code ?? "No response";
  return d.status === "retrying" ? `${why} · retrying (attempt ${d.attempt})` : why;
}

/** How a receiver checks our signature — shown with the secret, as documented in the spec. */
export const SIGNATURE_EXAMPLE = `// Node.js: verify a delivery
import { createHmac, timingSafeEqual } from "node:crypto";

const ts = req.headers["x-vernacular-timestamp"];
const sig = req.headers["x-vernacular-signature"];
const expected = createHmac("sha256", SECRET).update(\`\${ts}.\${rawBody}\`).digest("hex");
const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  && Math.abs(Date.now() / 1000 - Number(ts)) < 300; // reject replays older than 5 min`;
