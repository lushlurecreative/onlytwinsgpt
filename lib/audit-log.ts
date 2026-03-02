import type { SupabaseClient } from "@supabase/supabase-js";
import { logWarn } from "@/lib/observability";

type AuditInput = {
  actor: string;
  actionType: string;
  entityRef: string;
  beforeJson?: unknown;
  afterJson?: unknown;
};

export async function writeAuditLog(admin: SupabaseClient, input: AuditInput) {
  const { error } = await admin.from("audit_log").insert({
    actor: input.actor,
    action_type: input.actionType,
    entity_ref: input.entityRef,
    before_json: input.beforeJson ?? null,
    after_json: input.afterJson ?? null,
  });
  if (error) {
    logWarn("audit_log_write_failed", {
      actor: input.actor,
      actionType: input.actionType,
      entityRef: input.entityRef,
      message: error.message,
    });
  }
}
