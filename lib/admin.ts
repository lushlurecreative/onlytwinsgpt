export function getAdminUserIds() {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAdminOwnerEmails() {
  const raw = process.env.ADMIN_OWNER_EMAILS ?? "osborneinvestmentgroup@gmail.com";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(userId: string, email?: string | null) {
  if (getAdminUserIds().includes(userId)) return true;
  if (email && getAdminOwnerEmails().includes(email.trim().toLowerCase())) return true;
  return false;
}

