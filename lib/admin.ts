function parseCsv(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getAdminUserIds() {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return parseCsv(raw).filter(isUuid);
}

export function getAdminOwnerEmails() {
  const raw = process.env.ADMIN_OWNER_EMAILS ?? "lush.lure.creative@gmail.com";
  return parseCsv(raw).map((s) => s.toLowerCase());
}

export function isAdminUser(userId: string, email?: string | null) {
  const emailLower = email?.trim().toLowerCase() ?? null;
  return !!emailLower && getAdminOwnerEmails().includes(emailLower);
}

