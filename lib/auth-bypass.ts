const FALLBACK_BYPASS_USER_ID = "00000000-0000-4000-8000-000000000001";

export function isAuthBypassed() {
  return process.env.AUTH_DISABLED === "true";
}

export function getBypassUserId() {
  const fromEnv = process.env.AUTH_BYPASS_USER_ID?.trim();
  if (fromEnv) return fromEnv;

  const firstAdmin = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)[0];
  return firstAdmin ?? FALLBACK_BYPASS_USER_ID;
}

export function getBypassUser() {
  const id = getBypassUserId();
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "bypass-user@onlytwins.local",
  };
}

