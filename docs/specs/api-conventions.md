# API conventions (apps/api)

Context file for AI tools. Read together with `AGENTS.md` and `data-model.md`.

## Request lifecycle (tenant routes)

```
cookie ──► onRequest: Better Auth getSession ──► 401 UNAUTHENTICATED if none
              │   resolve tenant = session.activeOrganizationId (default: user's oldest membership)
              │   resolve role   = member.role for that tenant      ──► 403 NO_TENANT_CONTEXT / NOT_A_MEMBER
              ▼
        preHandler: BEGIN; set_config('app.tenant_id', tenant, true)      ──► 403 TENANT_SUSPENDED
              │   request.authCtx = { userId, tenantId, role, isPlatformAdmin, ... }
              │   request.tx      = the open transaction (RLS active)
              ▼
        route preHandlers (requireRole …) ─► handler ─► onSend: COMMIT if status < 400, else ROLLBACK
```

Session cookie: `better-auth.session_token` (httpOnly, same origin, `Secure` in production). A user's role/membership is
re-read on **every** request, so removing a member or suspending a tenant takes effect immediately.

## Adding an endpoint

1. Contracts: `packages/contracts/src/<feature>.ts` (zod; export from `index.ts`). Query/body/params + response.
2. `apps/api/src/modules/<feature>/{repo,service,routes}.ts` — copy `modules/leads`.
   - `routes.ts`: `FastifyPluginAsyncZod`, `schema: { tags, summary, querystring|body|params, response: { 200: …, 401: apiError } }`.
   - `service.ts`: `(tx, auth, input) => output`, no HTTP types. Mask/scope by role here.
   - `repo.ts`: Kysely only; takes `tx`. No tenant_id filter needed (RLS) but indexes lead with `tenant_id`.
3. Add the plugin to `src/modules/index.ts`.
4. Tests (real Postgres): happy path, each role, validation 422, cross-tenant. Add `:param` fixtures to `test/cross-tenant.test.ts`.

```ts
export const thingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/things/:thingId",
    {
      preHandler: requireRole("owner", "admin", "admission_head"),
      schema: {
        params: z.object({ thingId: z.uuid() }),
        response: { 200: thingResponse, 404: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return getThing(tx, auth, req.params.thingId);
    },
  );
};
```

## Error contract

| HTTP | `error.code`                                                                                                                       | When                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 401  | `UNAUTHENTICATED`                                                                                                                  | no/invalid session                                                 |
| 403  | `FORBIDDEN`, `INSUFFICIENT_ROLE`, `LEAD_NOT_ASSIGNED`, `NO_TENANT_CONTEXT`, `NOT_A_MEMBER`, `TENANT_SUSPENDED`, `ACCOUNT_DISABLED` | authenticated but not allowed                                      |
| 404  | `NOT_FOUND`                                                                                                                        | missing **or in another tenant** (indistinguishable on purpose)    |
| 409  | `CONFLICT`                                                                                                                         | uniqueness / state conflicts                                       |
| 422  | `VALIDATION_ERROR` (`details: [{path, message}]`)                                                                                  | body/query/params failed zod                                       |
| 429  | `RATE_LIMITED`                                                                                                                     | too many requests                                                  |
| 500  | `INTERNAL`                                                                                                                         | anything unexpected (generic message; details only in server logs) |

Auth endpoints under `/api/auth/*` are Better Auth's own; their error bodies are Better Auth's format, not the one above.

## Auth endpoints (Better Auth, public)

| Purpose         | Call                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in         | `POST /api/auth/sign-in/email` `{ email, password }` → sets cookie                                                                                                                                                   |
| Sign out        | `POST /api/auth/sign-out` `{}`                                                                                                                                                                                       |
| Forgot password | `POST /api/auth/request-password-reset` `{ email, redirectTo }` → always 200 (no enumeration); email link → redirects to `redirectTo?token=…`                                                                        |
| Reset password  | `POST /api/auth/reset-password` `{ newPassword, token }` (min 10 chars)                                                                                                                                              |
| Google          | `POST /api/auth/sign-in/social` `{ provider: "google", callbackURL }` per Better Auth docs — **not yet tested** (needs real Google credentials); existing users only, enabled when `GOOGLE_CLIENT_ID/SECRET` are set |
| Session probe   | `GET /api/me` (our own; 401 when logged out)                                                                                                                                                                         |

Public self sign-up is **disabled**. Users are created by the seed script, tenant creation (Day 6) and invitations (Day 6).
Brute-force limit: 20 req/min/IP on `/api/auth/*`; 600 req/min/IP elsewhere.

## Internal API docs

`/api/docs` (Swagger UI) and `/api/docs/json` are on in dev/test. In production they are off unless `ENABLE_API_DOCS=true`,
and then require a super-admin session.

## Config (env, validated at boot — the process exits with a readable message if invalid)

`DATABASE_URL` (app role), `PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `MASTER_KEY` (base64, 32 bytes),
`MASTER_KEY_VERSION`, `MASTER_KEY_PREVIOUS` (JSON `{ "1": "<base64>" }` during rotation), `GOOGLE_CLIENT_ID/SECRET` (optional),
`ENABLE_API_DOCS`, `RATE_LIMIT_ENABLED`, `PORT`, `LOG_LEVEL`. Dev-only secret values from `.env.example` are rejected when `NODE_ENV=production`.

## Public routes (webhooks, intake) — the pattern

Public routes have no session, so there is no automatic tenant context. They resolve the tenant from an unguessable key
in the URL via a `SECURITY DEFINER` lookup, authenticate the caller themselves (HMAC / bearer), then use `withTenant`:

```ts
app.post("/api/webhooks/dograh/:tenantKey", { config: { public: true }, schema: { hide: true, params: … } }, async (req, reply) => {
  const t = (await sql<{ tenant_id: string; status: string }>`select * from crm.resolve_tenant_by_webhook_key(${req.params.tenantKey})`.execute(app.db)).rows[0];
  if (!t) return reply.status(404).send(body("NOT_FOUND", "Not found"));            // same answer for bad key as missing
  const secret = await app.secrets.requireSecret(t.tenant_id, "dograh_webhook_secret");
  verifyHmac(secret, req.rawBody!, req.headers);                                      // 401 on mismatch
  await withTenant(app.db, t.tenant_id, async (tx) => {
    // write raw payload, then enqueue in the SAME tx:
    await app.jobs.enqueueInTx(tx, deriveJob, { tenantId: t.tenant_id, runId });
  });
  return reply.status(200).send({ ok: true });                                         // respond fast; work happens in the job
});
```

Remember to add the new public route to the expected-public list in `test/tenant-scope.test.ts` (that is the point:
making a route public is a reviewed decision) and give it its own auth/negative tests.

## Services available on `app`

|               |                                                                                  |
| ------------- | -------------------------------------------------------------------------------- |
| `app.db`      | app-role Kysely. Use `withTenant(app.db, tenantId, fn)` outside tenant routes.   |
| `app.jobs`    | `enqueueInTx(tx, job, data, opts?)`                                              |
| `app.secrets` | `getSecret / requireSecret / setSecret / deleteSecret / rotateTenant`            |
| `app.mailer`  | `send({ to, subject, text })` (console in dev until the email adapter lands, D6) |
| `app.config`  | validated env                                                                    |
| `app.auth`    | Better Auth instance                                                             |
