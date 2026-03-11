function parseCsv(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAdminOwnerEmails() {
  const raw = process.env.ADMIN_OWNER_EMAILS ?? "lush.lure.creative@gmail.com";
  return parseCsv(raw).map((s) => s.toLowerCase());
}

export function isAdminUser(_userId: string, email?: string | null) {
  const emailLower = email?.trim().toLowerCase() ?? null;
  return !!emailLower && getAdminOwnerEmails().includes(emailLower);
}

