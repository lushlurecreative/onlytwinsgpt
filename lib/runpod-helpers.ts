/**
 * RunPod integration helpers with health checks and resilient polling.
 */

/**
 * Verify RunPod endpoint is accessible.
 * Used for startup validation and health checks.
 */
export async function checkRunPodHealth(
  endpointId: string
): Promise<{ healthy: boolean; error?: string }> {
  if (!endpointId || endpointId.trim().length === 0) {
    return {
      healthy: false,
      error: "RUNPOD_ENDPOINT_ID not configured",
    };
  }

  try {
    const response = await fetch(
      `https://${endpointId}.api.runpod.ai/ping`,
      {
        method: "GET",
        timeout: 5000,
      } as any
    );

    if (!response.ok) {
      return {
        healthy: false,
        error: `RunPod health check returned ${response.status}`,
      };
    }

    const data = await response.json();
    if (data.status === "ok") {
      return { healthy: true };
    }

    return {
      healthy: false,
      error: "RunPod health check returned unexpected status",
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Poll RunPod job status with exponential backoff.
 * Starts at 2s, increases to 4s, 8s, max 16s between attempts.
 */
export async function pollRunPodJob(
  endpointId: string,
  jobId: string,
  maxWaitMs: number = 120000 // 120s per job
): Promise<{
  status: "COMPLETED" | "FAILED" | "TIMEOUT";
  output?: any;
  error?: string;
}> {
  let elapsedMs = 0;
  let pollIntervalMs = 2000; // Start at 2s
  const maxPollIntervalMs = 16000; // Max 16s between polls
  let attempts = 0;

  while (elapsedMs < maxWaitMs) {
    try {
      const response = await fetch(
        `https://${endpointId}.api.runpod.ai/status/${jobId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        } as any
      );

      if (!response.ok) {
        console.warn(
          `[poll ${jobId}] HTTP ${response.status} on attempt ${attempts + 1}`
        );
        // Don't fail on transient HTTP errors, just wait and retry
      } else {
        const statusResult = await response.json();
        const status = statusResult.status;

        if (status === "COMPLETED") {
          return {
            status: "COMPLETED",
            output: statusResult.output,
          };
        }

        if (status === "FAILED") {
          return {
            status: "FAILED",
            error: statusResult.error || "Job failed with no error message",
          };
        }

        // Status is IN_PROGRESS or QUEUED, keep polling
      }
    } catch (error) {
      console.warn(
        `[poll ${jobId}] Error on attempt ${attempts + 1}:`,
        error instanceof Error ? error.message : String(error)
      );
      // Network error, will retry
    }

    // Wait before next poll (exponential backoff)
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    elapsedMs += pollIntervalMs;
    attempts++;

    // Increase interval for next iteration, capped at maxPollIntervalMs
    pollIntervalMs = Math.min(
      pollIntervalMs * 1.5,
      maxPollIntervalMs
    );
  }

  return {
    status: "TIMEOUT",
    error: `Job did not complete within ${maxWaitMs / 1000}s`,
  };
}

/**
 * Verify Supabase configuration is valid.
 */
export function validateSupabaseConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    errors.push("SUPABASE_URL not configured");
  } else if (!supabaseUrl.startsWith("https://")) {
    errors.push("SUPABASE_URL must start with https://");
  } else if (!supabaseUrl.includes(".supabase.co")) {
    errors.push("SUPABASE_URL does not look like a valid Supabase URL");
  }

  const supabaseKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    errors.push("SUPABASE_ANON_KEY not configured");
  } else if (supabaseKey.length < 20) {
    errors.push("SUPABASE_ANON_KEY looks invalid (too short)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
