-- Phase 1 real-world intake: persist the preprocessing report for every training run.
--
-- The worker writes this when preprocess_intake.py runs, so we can reconstruct
-- why a training set was accepted/rejected without re-inspecting raw uploads.
-- Schema matches the IntakeReport type in lib/intake.ts (keep in sync).

alter table public.identity_models
  add column if not exists intake_report jsonb null;

comment on column public.identity_models.intake_report is
  'Worker-side preprocessing summary: accepted/auto_fixed/rejected counts, '
  'dominant_identity_ratio, reference_embedding_sha1, threshold_used, '
  'counts_by_rejection_reason, per_file decisions, ready_for_training flag. '
  'Written by worker/preprocess_intake.py before training kicks off.';

-- Partial index for admin diagnostics: find training runs that were gated by
-- intake filtering. Only indexes rows where the filter blocked training.
create index if not exists identity_models_intake_not_ready_idx
  on public.identity_models ((intake_report->>'ready_for_training'))
  where intake_report is not null and (intake_report->>'ready_for_training') = 'false';
