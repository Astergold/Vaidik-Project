# Lead intake (D3-I2-02) — for providers and for the people who connect them

## The endpoint

```
POST {PUBLIC_BASE_URL}/api/intake/{sourceKey}
Authorization: Bearer {token}
Content-Type: application/json            (or application/x-www-form-urlencoded)
```

The **URL and token** come from Settings → Lead sources (the token is shown **once**; rotate it if lost).
**Call it from a server, never from a browser** (the token would be public; there is no CORS on purpose).

```bash
curl -X POST "https://app.laveric.com/api/intake/<sourceKey>" \
  -H "Authorization: Bearer vk_src_..." -H "Content-Type: application/json" \
  -d '{"name":"Asha Rao","mobile":"98765 43210","email":"asha@example.com","city":"Pune","course":"B.Tech Computer Science"}'
```

| Result                                                                                             | Meaning                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202 { status:"accepted", reference, duplicate, queued, warnings[] }`                              | Accepted. `reference` is our lead id. `duplicate:true` = this person already had a lead this cycle (nothing new, no new call). `queued:true` = an AI call was queued (it is still subject to calling hours, consent, DND at dial time). |
| `401`                                                                                              | Unknown source, wrong or missing token (all identical on purpose).                                                                                                                                                                      |
| `403 TENANT_SUSPENDED`                                                                             | The institution's account is suspended.                                                                                                                                                                                                 |
| `409 NO_ACTIVE_CYCLE`                                                                              | The institution has no current admission cycle configured.                                                                                                                                                                              |
| `422 VALIDATION_ERROR` with `details:[{path:"phone", message:"PHONE_INVALID" \| "PHONE_MISSING"}]` | Unusable phone number. Nothing is stored.                                                                                                                                                                                               |
| `413`                                                                                              | Body over 100 KB.                                                                                                                                                                                                                       |

Responds in ~10 ms (p95 17 ms measured): no external calls on this path. Submitting the same form five times at once yields one
person, one lead, one call.

## Field mapping

With **no mapping at all**, these top-level keys are recognised case-insensitively: phone (`phone`, `mobile`, `mobile_number`,
`phone_number`, `contact`, `contact_number`, `whatsapp`), name (`full_name`, `name`, `student_name`, or `first_name`+`last_name`),
`email`, `city`, `state`, `language`, `program` (`program`, `course`, `programme`…). For anything else, set a mapping on the source:

```json
{
  "full_name": ["lead.first", "lead.last"],
  "phone": "lead.contact.mobile",
  "email": "lead.email",
  "program": "lead.course",
  "external_id": "lead.id",
  "consent": "lead.agreed",
  "consent_channels": ["voice", "whatsapp"],
  "state": { "const": "Maharashtra" }
}
```

Paths are `a.b[0].c` (optional leading `$.`). A path, a list of paths (joined with spaces) or `{const}`. `external_id` is **never**
guessed. Only these keys exist (unknown keys are rejected). The **"Test payload" box** in the editor calls
`POST /api/settings/sources/:id/test-mapping` and writes nothing.

## What gets stored

- **Phone** → E.164 (`+91…`) via the shared `normalizePhone` (accepts `9876543210`, `09876543210`, `91…`, `+91 98765-43210`,
  `0091…`, Devanagari digits; rejects landlines, wrong lengths, `9999999999`, Excel-mangled numbers). Same number in any spelling = same person.
- **Person** found by phone, else created. A returning student's blanks are filled; existing data is never overwritten.
- **Email / external id** are added as identifiers. If one already belongs to a _different_ person, a `duplicate_candidate` is raised (the lead is still accepted).
- **Program** matched by name (case-insensitive), else the source's default program; unknown name → warning `PROGRAM_NOT_FOUND`.
- **Lead** for the current cycle (one per person per cycle), stage `new`, stage history row (actor `integration`), the source's default AI agent.
- **Consent**: a form submission counts as consent **for voice** (override with `consent_channels`), stored with evidence
  (source, IP, user agent, time). If the mapped consent field says "no" (or an unrecognised value) it is recorded as **not** granted.
- **Call**: when `autoDial` is on and the lead is new, `call.dial` is queued **in the same database transaction** (commit ⇒ the job
  exists; rollback ⇒ it never does, and the lead isn't half-created).

Warnings (never rejections): `EMAIL_INVALID`, `LANGUAGE_UNRECOGNISED`, `PROGRAM_NOT_FOUND`, `CONSENT_UNRECOGNISED`.

## Duplicates

A second submission for the same person in the same cycle returns `duplicate:true` and does **not** queue another call. (Whether
a re-submission should re-engage a lost lead is a product decision; v1 does nothing.)

## Security notes

- Tokens are 256-bit random; only a SHA-256 hash is stored and compared in constant time. (The handbook says argon2 for API keys;
  a slow KDF protects low-entropy passwords and only adds latency to a high-entropy token — flagged for Vaidik.)
- Per-source rate limit 600/min. Body ≤ 100 KB. Payload keys like `__proto__` are inert (paths read own properties only).
