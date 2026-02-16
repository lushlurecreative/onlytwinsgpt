export const RATE_LIMITS = {
  authLoginPage: { limit: 120, windowMs: 60_000 },
  uploads: { limit: 30, windowMs: 60_000 },
  billingCheckout: { limit: 20, windowMs: 60_000 },
  billingWebhook: { limit: 120, windowMs: 60_000 },
} as const;

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export function getMaxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
  return configured;
}

