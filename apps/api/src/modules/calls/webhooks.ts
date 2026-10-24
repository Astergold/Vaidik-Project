/**
 * GODRAH Webhook Handlers
 * Public endpoints that receive real-time call events from GODRAH.
 * No tenant session required — resolved via dograh_run_id or call_attempt_id in payload.
 */

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import { apiError } from "@vernacular/contracts";
import { unauthenticated } from "../../errors.js";
import { tenantCtx } from "../../context.js";
import { moveStage } from "../leads/stage.js";
import { audit } from "../../lib/audit.js";
import { normalizePhone } from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import type { AuthContext } from "../../types.js";

const webhookTag = ["webhooks", "godrah"];

// GODRAH webhook payload schema (validated at runtime)
const webhookPayloadSchema = z.object({
  event: z.enum([
    "call.started",
    "call.ended",
    "transcript.ready",
    "recording.ready",
    "analysis.ready",
  ]),
  run_id: z.string().min(1),
  timestamp: z.string().datetime(),
  data: z.object({
    run_id: z.string(),
    workflow_id: z.string(),
    phone_e164: z.string(),
    status: z.enum([
      "queued",
      "initiated",
      "ringing",
      "in_progress",
      "completed",
      "failed",
      "no_answer",
      "busy",
      "canceled",
    ]),
    started_at: z.string().datetime().nullable(),
    ended_at: z.string().datetime().nullable(),
    duration_seconds: z.number().int().nullable(),
    disposition: z.string().nullable(),
    recording_url: z.string().url().nullable(),
    transcript: z
      .object({
        segments: z.array(
          z.object({
            speaker: z.enum(["agent", "user"]),
            text: z.string(),
            start_time: z.number(),
            end_time: z.number(),
            confidence: z.number().optional(),
          }),
        ),
        full_text: z.string(),
        language: z.string(),
      })
      .nullable(),
    analysis: z
      .object({
        summary: z.string(),
        next_step: z.enum([
          "book_visit",
          "fill_form",
          "pay_fee",
          "callback",
          "counsellor_call",
          "send_info",
          "none",
        ]),
        next_step_due_at: z.string().datetime().nullable(),
        objections: z.array(
          z.object({
            type: z.string(),
            verbatim_quote: z.string(),
          }),
        ),
        needs_counsellor: z.boolean(),
        needs_counsellor_reason: z.string().nullable(),
        temperature: z.enum(["hot", "warm", "cold", "invalid"]).nullable(),
        extracted: z.record(z.string(), z.unknown()),
        language_detected: z.string().nullable(),
      })
      .nullable(),
    initial_context: z.record(z.string(), z.unknown()),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// Map GODRAH status to our call_attempt status
const statusMap: Record<WebhookPayload["data"]["status"], string> = {
  queued: "dialing",
  initiated: "dialing",
  ringing: "in_progress",
  in_progress: "in_progress",
  completed: "completed",
  failed: "failed",
  no_answer: "no_answer",
  busy: "busy",
  canceled: "failed",
};

/**
 * Verify webhook signature using per-tenant secret.
 * Returns the tenant_id if valid, throws otherwise.
 */
async function verifyWebhookSignature(
  app: FastifyInstance,
  payload: string,
  signature: string | undefined,
): Promise<string> {
  if (!signature) throw unauthenticated("Missing webhook signature");

  // Find tenant by checking all tenants' webhook secrets
  const rows = await sql<{ tenant_id: string; secret: string }>`
    SELECT tenant_id, secret FROM crm.tenant_secret
    WHERE kind = 'godrah_webhook_secret'
  `.execute(app.db);

  for (const row of rows.rows) {
    const expectedSig = await computeHmacSha256(row.secret, payload);
    if (timingSafeEqual(signature, expectedSig)) {
      return row.tenant_id;
    }
  }

  throw unauthenticated("Invalid webhook signature");
}

// HMAC-SHA256 using Web Crypto API
async function computeHmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(signature).toString("hex");
}

// Constant-time comparison
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  let result = 0;
  for (let i = 0; i < ab.length; i++) {
    result |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return result === 0;
}

/**
 * Find or create call_attempt by dograh_run_id.
 * Uses the initial_context.call_attempt_id as fallback for linking.
 */
async function findOrCreateCallAttempt(
  tx: Tx,
  tenantId: string,
  run: WebhookPayload["data"],
): Promise<{ id: string; leadId: string } | null> {
  // First, try to find by dograh_run_id
  let attempt = await tx
    .selectFrom("call_attempt")
    .select(["id", "lead_id"])
    .where("tenant_id", "=", tenantId)
    .where("dograh_run_id", "=", run.run_id)
    .executeTakeFirst();

  if (attempt) return { id: attempt.id, leadId: attempt.lead_id };

  // Fallback: find by initial_context.call_attempt_id
  const callAttemptId = run.initial_context?.call_attempt_id as string | undefined;
  if (callAttemptId) {
    attempt = await tx
      .selectFrom("call_attempt")
      .select(["id", "lead_id"])
      .where("tenant_id", "=", tenantId)
      .where("id", "=", callAttemptId)
      .executeTakeFirst();

    if (attempt) {
      // Adopt this attempt by setting dograh_run_id
      await tx
        .updateTable("call_attempt")
        .set({ dograh_run_id: run.run_id })
        .where("id", "=", attempt.id)
        .execute();
      return { id: attempt.id, leadId: attempt.lead_id };
    }
  }

  // Last resort: find by phone + lead (for inbound)
  const leadIdFromContext = run.initial_context?.lead_id as string | undefined;

  if (leadIdFromContext) {
    attempt = await tx
      .selectFrom("call_attempt")
      .select(["id", "lead_id"])
      .where("tenant_id", "=", tenantId)
      .where("lead_id", "=", leadIdFromContext)
      .where("status", "in", ["reserved", "dialing", "in_progress"])
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    if (attempt) {
      await tx
        .updateTable("call_attempt")
        .set({ dograh_run_id: run.run_id })
        .where("id", "=", attempt.id)
        .execute();
      return { id: attempt.id, leadId: attempt.lead_id };
    }
  }

  return null;
}

/**
 * Process a webhook event - shared logic for all event types.
 * Exported for use by the sync job.
 */
export async function processWebhookEvent(
  tx: Tx,
  tenantId: string,
  auth: AuthContext,
  run: WebhookPayload["data"],
  event: WebhookPayload["event"],
): Promise<void> {
  // Upsert raw run payload for audit/replay
  // The webhook payload is validated by Zod schema; JSON column accepts any JSON-serializable value
  await tx
    .insertInto("dograh_run_raw")
    .values({
      tenant_id: tenantId,
      dograh_run_id: run.run_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: run as any,
    })
    .onConflict((oc) =>
      oc
        .column("tenant_id")
        .column("dograh_run_id")
        .doUpdateSet({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: run as any,
        }),
    )
    .execute();

  // Find or create the call attempt
  const attemptInfo = await findOrCreateCallAttempt(tx, tenantId, run);
  if (!attemptInfo) {
    console.warn(`No call_attempt found for run ${run.run_id}, event ${event}`);
    return;
  }

  const { id: attemptId, leadId } = attemptInfo;

  switch (event) {
    case "call.started": {
      await tx
        .updateTable("call_attempt")
        .set({
          status: "dialing",
          dograh_run_id: run.run_id,
          started_at: run.started_at ? new Date(run.started_at) : new Date(),
        })
        .where("id", "=", attemptId)
        .execute();
      break;
    }

    case "call.ended": {
      const finalStatus = statusMap[run.status] ?? "failed";
      await tx
        .updateTable("call_attempt")
        .set({
          status: finalStatus,
          dograh_run_id: run.run_id,
          ended_at: run.ended_at ? new Date(run.ended_at) : new Date(),
          duration_s: run.duration_seconds ?? null,
          disposition: run.disposition ?? null,
          recording_key: run.recording_url
            ? `tenants/${tenantId}/recordings/${run.run_id}.wav`
            : null,
          // Transcript is validated by Zod schema; JSON column accepts any JSON-serializable value
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transcript: run.transcript as any,
          transcript_text: run.transcript?.full_text ?? null,
        })
        .where("id", "=", attemptId)
        .execute();

      // Record usage event for completed calls
      if (run.duration_seconds && run.duration_seconds > 0) {
        await tx
          .insertInto("usage_event")
          .values({
            tenant_id: tenantId,
            kind: "call_minute",
            quantity: Math.ceil(run.duration_seconds / 60),
            unit_price: 0,
            call_attempt_id: attemptId,
            ref: run.run_id,
          })
          .execute();
      }
      break;
    }

    case "transcript.ready": {
      if (run.transcript) {
        await tx
          .updateTable("call_attempt")
          .set({
            // Transcript is validated by Zod schema; JSON column accepts any JSON-serializable value
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            transcript: run.transcript as any,
            transcript_text: run.transcript.full_text,
          })
          .where("id", "=", attemptId)
          .execute();
      }
      break;
    }

    case "recording.ready": {
      if (run.recording_url) {
        // TODO: Download recording from GODRAH URL and upload to R2
        await tx
          .updateTable("call_attempt")
          .set({ recording_key: run.recording_url })
          .where("id", "=", attemptId)
          .execute();
      }
      break;
    }

    case "analysis.ready": {
      if (run.analysis) {
        await createAnalysisAndSideEffects(tx, tenantId, auth, attemptId, leadId, run);
      }
      break;
    }
  }
}

/**
 * Create analysis row and all side effects (queue items, temperature observations, stage moves).
 */
async function createAnalysisAndSideEffects(
  tx: Tx,
  tenantId: string,
  auth: AuthContext,
  attemptId: string,
  leadId: string,
  run: WebhookPayload["data"],
): Promise<void> {
  const a = run.analysis!;

  // 1. Create analysis row
  // Analysis fields are validated by Zod schema; JSON columns accept any JSON-serializable value
  await tx
    .insertInto("analysis")
    .values({
      tenant_id: tenantId,
      call_attempt_id: attemptId,
      model: "godrah",
      summary: a.summary,
      next_step: a.next_step,
      next_step_due_at: a.next_step_due_at ? new Date(a.next_step_due_at) : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      objections: a.objections as any,
      needs_counsellor: a.needs_counsellor,
      needs_counsellor_reason: a.needs_counsellor_reason,
      language_detected: a.language_detected,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extracted: a.extracted as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw: run as any,
    })
    .onConflict((oc) =>
      oc.column("call_attempt_id").doUpdateSet({
        summary: a.summary,
        next_step: a.next_step,
        next_step_due_at: a.next_step_due_at ? new Date(a.next_step_due_at) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        objections: a.objections as any,
        needs_counsellor: a.needs_counsellor,
        needs_counsellor_reason: a.needs_counsellor_reason,
        language_detected: a.language_detected,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extracted: a.extracted as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw: run as any,
      }),
    )
    .execute();

  // 2. Temperature observation from AI (with verbatim quote validation)
  if (a.temperature) {
    const quote = a.objections[0]?.verbatim_quote ?? a.summary.slice(0, 200);
    await tx
      .insertInto("lead_temperature_observation")
      .values({
        tenant_id: tenantId,
        lead_id: leadId,
        value: a.temperature,
        source: "ai_analyst",
        verbatim_quote: quote,
        call_attempt_id: attemptId,
        observer_user_id: auth.userId,
        reason: "AI analysis from call",
      })
      .execute();
  }

  // 3. Counsellor queue item if needed
  if (a.needs_counsellor) {
    await tx
      .insertInto("counsellor_queue_item")
      .values({
        tenant_id: tenantId,
        lead_id: leadId,
        call_attempt_id: attemptId,
        kind: "needs_counsellor",
        reason: a.needs_counsellor_reason ?? "AI flagged for counsellor review",
        assignee_id: null,
        due_at: a.next_step_due_at ? new Date(a.next_step_due_at) : null,
      })
      .execute();
  }

  // 4. Move stage via moveStage (mode: "auto" for system-initiated)
  const stageMap: Record<string, string> = {
    book_visit: "visit_booked",
    fill_form: "form_sent",
    pay_fee: "fee_pending",
    callback: "callback_scheduled",
    counsellor_call: "counsellor_assigned",
    send_info: "info_sent",
  };

  const targetStage = stageMap[a.next_step];
  if (targetStage && a.next_step !== "none") {
    await moveStage(tx, {
      leadId,
      // Stage string is validated by Zod schema; moveStage accepts the stage enum
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: targetStage as any,
      actor: "system",
      mode: "auto",
      reason: `AI next_step: ${a.next_step}`,
    });
  }

  // 5. Audit log
  await audit(tx, auth, {
    action: "call.analysis_created",
    entity: "analysis",
    entityId: attemptId,
    diff: {
      next_step: a.next_step,
      temperature: a.temperature,
      needs_counsellor: a.needs_counsellor,
    },
  });
}

/**
 * Get tenant context for public webhook routes.
 * Creates a minimal request object with tenantId for tenantCtx.
 */
function getTenantContext(req: FastifyRequest, tenantId: string): { tx: Tx; auth: AuthContext } {
  // Request is extended with tenantId for tenantCtx; types are validated at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantCtx({ ...req, tenantId } as any);
}

export const godrahWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  // Single webhook endpoint for all GODRAH events
  app.post(
    "/api/webhooks/godrah",
    {
      config: { public: true },
      schema: {
        tags: webhookTag,
        summary: "GODRAH webhook receiver",
        body: webhookPayloadSchema,
        response: { 200: z.object({ ok: z.boolean() }), 401: apiError, 500: apiError },
      },
    },
    async (req, reply) => {
      const rawBody = JSON.stringify(req.body);
      const signature = req.headers["x-godrah-signature"] as string | undefined;

      // Verify signature and get tenant_id
      const tenantId = await verifyWebhookSignature(app, rawBody, signature);

      // Process within tenant transaction
      const { tx, auth } = getTenantContext(req, tenantId);

      await processWebhookEvent(tx, tenantId, auth, req.body.data, req.body.event);

      return reply.send({ ok: true });
    },
  );

  // Pre-call webhook for inbound calls - returns initial_context
  app.post(
    "/api/webhooks/godrah/pre-call",
    {
      config: { public: true },
      schema: {
        tags: webhookTag,
        summary: "GODRAH pre-call context (inbound)",
        body: z.object({
          run_id: z.string(),
          phone_e164: z.string(),
          initial_context: z.record(z.string(), z.unknown()).optional(),
        }),
        response: { 200: z.unknown(), 401: apiError, 404: apiError },
      },
    },
    async (req, reply) => {
      // Verify signature
      const rawBody = JSON.stringify(req.body);
      const signature = req.headers["x-godrah-signature"] as string | undefined;
      const tenantId = await verifyWebhookSignature(app, rawBody, signature);

      const { tx } = getTenantContext(req, tenantId);

      // Extract lead_id from initial_context or find by phone
      const callAttemptId = req.body.initial_context?.call_attempt_id as string | undefined;
      let leadId = req.body.initial_context?.lead_id as string | undefined;

      if (!leadId && callAttemptId) {
        const attempt = await tx
          .selectFrom("call_attempt")
          .select("lead_id")
          .where("tenant_id", "=", tenantId)
          .where("id", "=", callAttemptId)
          .executeTakeFirst();
        leadId = attempt?.lead_id;
      }

      if (!leadId) {
        // Try to find lead by phone via person_identifier
        const phoneResult = normalizePhone(req.body.phone_e164);
        if (!phoneResult.ok) {
          return reply
            .status(404)
            .send({ error: { code: "NOT_FOUND", message: "Invalid phone number" } });
        }
        const phoneE164 = phoneResult.e164;
        const personId = await tx
          .selectFrom("person_identifier")
          .select("person_id")
          .where("tenant_id", "=", tenantId)
          .where("kind", "=", "phone")
          .where("value_norm", "=", phoneE164)
          .executeTakeFirst();

        if (personId) {
          const lead = await tx
            .selectFrom("lead")
            .select("id")
            .where("tenant_id", "=", tenantId)
            .where("person_id", "=", personId.person_id)
            .orderBy("created_at", "desc")
            .executeTakeFirst();
          leadId = lead?.id;
        }
      }

      if (!leadId) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "No lead found for this call" } });
      }

      // Build initial context using shared function
      const { buildInitialContext } = await import("./context.js");
      const context = await buildInitialContext(tx, leadId, { isNewCaller: !callAttemptId });

      return context;
    },
  );
};
