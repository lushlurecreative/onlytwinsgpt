/**
 * Apify API: run actor and get dataset items. Used for Instagram (and later TikTok) lead scraping.
 */
const APIFY_BASE = "https://api.apify.com/v2";

function getToken(): string {
  return process.env.APIFY_TOKEN?.trim() || "";
}

export type RunActorResult = {
  runId: string;
  status: string;
  datasetId: string;
};

/** Start an actor run. Returns run id and dataset id. */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<RunActorResult | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${APIFY_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data: { id: string; status: string; defaultDatasetId: string } };
  return {
    runId: data.data.id,
    status: data.data.status,
    datasetId: data.data.defaultDatasetId,
  };
}

/** Wait for run to finish (poll every 2s, max 5 min), then return dataset items. */
export async function runActorAndGetItems(
  actorId: string,
  input: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<unknown[] | null> {
  const run = await runActor(actorId, input);
  if (!run) return null;
  const timeout = options?.timeoutMs ?? 300_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const statusRes = await fetch(
      `${APIFY_BASE}/actor-runs/${run.runId}?token=${getToken()}`
    );
    if (!statusRes.ok) return null;
    const statusData = (await statusRes.json()) as { data: { status: string } };
    const status = statusData.data?.status;
    if (status === "SUCCEEDED") {
      const itemsRes = await fetch(
        `${APIFY_BASE}/actor-runs/${run.runId}/dataset/items?token=${getToken()}`
      );
      if (!itemsRes.ok) return null;
      const items = (await itemsRes.json()) as unknown[];
      return Array.isArray(items) ? items : [];
    }
    if (status === "FAILED" || status === "ABORTED") return null;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
