-- System 4 hardening: convert RunPod callback dedup index to UNIQUE.
--
-- Background: 202604060001_system4_ops_reliability.sql created
-- job_events_dedup_idx as a regular partial index. The webhook used a
-- read-then-write check (SELECT job_events → INSERT job_events at end of
-- handler) which races: two callbacks arriving inside the gap both pass the
-- check and both proceed.
--
-- Fix: drop the non-unique index and recreate it as UNIQUE so a second
-- INSERT for the same (job_id, event) tuple is rejected at the DB layer.
-- The webhook's new claimCallbackProcessing() helper relies on this
-- constraint to atomically claim the right to process a terminal callback
-- via INSERT ... ON CONFLICT DO NOTHING RETURNING.
--
-- Pre-deploy safety check (run before applying):
--   SELECT job_id, event, count(*)
--   FROM job_events
--   WHERE job_type IN ('training','generation')
--     AND event IN ('completed','failed')
--   GROUP BY job_id, event
--   HAVING count(*) > 1;
-- If any rows return, delete older duplicates first (keep min(created_at)).

DROP INDEX IF EXISTS job_events_dedup_idx;

CREATE UNIQUE INDEX IF NOT EXISTS job_events_dedup_idx
  ON job_events (job_id, event)
  WHERE job_type IN ('training', 'generation')
    AND event IN ('completed', 'failed');
