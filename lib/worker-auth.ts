/**
 * Worker auth: internal API must be called with shared secret only.
 * Worker uses SUPABASE_SERVICE_ROLE_KEY for storage; for app API use WORKER_SECRET.
 */

export function requireWorkerSecret(request: Request): boolean {
  const secret = process.env.WORKER_SECRET?.trim();
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearer && bearer === secret) return true;
  const headerSecret = request.headers.get("x-worker-secret");
  return headerSecret === secret;
}
