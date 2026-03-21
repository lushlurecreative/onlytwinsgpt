import { NextRequest, NextResponse } from "next/server";
import {
  checkRunPodHealth,
  validateSupabaseConfig,
} from "@/lib/runpod-helpers";

/**
 * Health check for preview face-swap functionality.
 * Verifies RunPod endpoint is accessible and Supabase is configured.
 * Used by deploy checks and homepage startup validation.
 */
export async function GET(req: NextRequest) {
  const checks = {
    runpod: { healthy: false, error: "" },
    supabase: { valid: false, errors: [] as string[] },
    timestamp: new Date().toISOString(),
  };

  // Check RunPod endpoint
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!endpointId) {
    checks.runpod.error = "RUNPOD_ENDPOINT_ID not configured";
  } else {
    const health = await checkRunPodHealth(endpointId);
    checks.runpod.healthy = health.healthy;
    if (!health.healthy) {
      checks.runpod.error = health.error || "Unknown error";
    }
  }

  // Check Supabase configuration
  const supabaseCheck = validateSupabaseConfig();
  checks.supabase.valid = supabaseCheck.valid;
  checks.supabase.errors = supabaseCheck.errors;

  // Overall health
  const allHealthy = checks.runpod.healthy && checks.supabase.valid;

  return NextResponse.json(
    {
      healthy: allHealthy,
      checks,
    },
    {
      status: allHealthy ? 200 : 503,
    }
  );
}
