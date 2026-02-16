function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

// For done-for-you plans, we treat OnlyTwins as the "creator" in the existing subscriptions table.
// This ID should be an admin user's profile id.
export function getServiceCreatorId() {
  const fromEnv = (process.env.SERVICE_CREATOR_ID ?? "").trim();
  if (fromEnv && isUuid(fromEnv)) return fromEnv;

  const firstAdmin = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)[0];

  if (firstAdmin && isUuid(firstAdmin)) return firstAdmin;

  // Safe fallback that is stable; you should set SERVICE_CREATOR_ID or ADMIN_USER_IDS in production.
  return "00000000-0000-4000-8000-000000000001";
}

