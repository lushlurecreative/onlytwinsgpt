export function getAdminUserIds() {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminUser(userId: string) {
  return getAdminUserIds().includes(userId);
}

