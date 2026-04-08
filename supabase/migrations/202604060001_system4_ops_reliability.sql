-- System 4: Ops + Reliability — job_events, failure_reason columns, cancelled status, usage refund support
-- Run BEFORE code deploy

-- ═══════════════════════════════════════════════════════════════
-- 1. job_events — centralised lifecycle event log
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS job_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type    text NOT NULL,           -- training, generation, generation_request, identity_model, photo_validation
  job_id      text NOT NULL,           -- FK is intentionally loose (references multiple tables)
  event       text NOT NULL,           -- e.g. created, dispatched, running, completed, failed, cancelled, retried, reaped, refunded
  message     text,                    -- human-readable detail or error message
  meta_json   jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS job_events_job_type_job_id_idx
  ON job_events (job_type, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_events_event_created_at_idx
  ON job_events (event, created_at DESC);

CREATE INDEX IF NOT EXISTS job_events_created_at_idx
  ON job_events (created_at DESC);

-- RLS: admin / service_role only
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_events_service_role_all"
  ON job_events FOR ALL
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- 2. failure_reason on generation_jobs
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE generation_jobs ADD COLUMN failure_reason text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. failure_reason on generation_requests
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE generation_requests ADD COLUMN failure_reason text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4. cancelled status on generation_job_status_enum
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TYPE generation_job_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 5. RunPod callback dedup index (lookup by runpod_job_id + event)
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS job_events_dedup_idx
  ON job_events (job_id, event) WHERE job_type IN ('training', 'generation');

-- ═══════════════════════════════════════════════════════════════
-- 6. source column on usage_ledger for refund entries
-- ═══════════════════════════════════════════════════════════════
-- source already exists (default 'generation_request'), verify it allows 'refund'
-- No enum constraint on source — it's free text, so 'refund' works natively.
