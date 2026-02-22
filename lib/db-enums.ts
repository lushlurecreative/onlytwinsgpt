/**
 * PostgreSQL enum types for leads.status and generation_jobs.status.
 * Keep in sync with supabase/migrations (lead_status_enum, generation_job_status_enum).
 */

export type LeadStatus =
  | "imported"
  | "approved"
  | "messaged"
  | "rejected"
  | "qualified"
  | "sample_queued"
  | "sample_done"
  | "outreach_sent"
  | "replied"
  | "converted"
  | "dead";

export const LEAD_STATUSES: LeadStatus[] = [
  "imported",
  "approved",
  "messaged",
  "rejected",
  "qualified",
  "sample_queued",
  "sample_done",
  "outreach_sent",
  "replied",
  "converted",
  "dead",
];

export type GenerationJobStatus =
  | "pending"
  | "running"
  | "upscaling"
  | "watermarking"
  | "completed"
  | "failed";

export const GENERATION_JOB_STATUSES: GenerationJobStatus[] = [
  "pending",
  "running",
  "upscaling",
  "watermarking",
  "completed",
  "failed",
];
