-- migrate:up
-- Reserve-then-dial: the call.dial job inserts a 'reserved' call_attempt, COMMITS, then calls the voice
-- provider. If the worker dies in between, pg-boss re-delivers the SAME job (same id). Recording the job id
-- on the attempt lets the retry recognise "this reservation is mine, resume it" (the provider call is made
-- with Idempotency-Key = call_attempt.id so a resumed dial can never produce a second real call), while a
-- DIFFERENT job meeting a fresh reservation backs off with CALL_IN_PROGRESS.
alter table crm.call_attempt add column dial_job_id uuid;
alter table crm.call_attempt add column dial_trigger text
  check (dial_trigger in ('intake', 'call_now', 'campaign', 'callback', 'planner', 'retry'));

-- Fast "is there a reservation to resume / abandon" lookups for one lead.
create index call_attempt_reserved on crm.call_attempt (tenant_id, lead_id) where status = 'reserved';

-- migrate:down
drop index if exists crm.call_attempt_reserved;
alter table crm.call_attempt drop column if exists dial_trigger;
alter table crm.call_attempt drop column if exists dial_job_id;
