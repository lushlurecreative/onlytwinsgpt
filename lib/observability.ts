type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(meta ?? {}),
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export function logInfo(event: string, meta?: Record<string, unknown>) {
  emit("info", event, meta);
}

export function logWarn(event: string, meta?: Record<string, unknown>) {
  emit("warn", event, meta);
}

export function logError(event: string, error: unknown, meta?: Record<string, unknown>) {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };
  emit("error", event, { ...(meta ?? {}), error: err });
}

export async function sendAlert(title: string, details: Record<string, unknown>) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        details,
        ts: new Date().toISOString(),
      }),
    });
  } catch (error) {
    logError("alert_webhook_failed", error, { title });
  }
}

