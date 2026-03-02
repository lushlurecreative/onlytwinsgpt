import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { logError } from "@/lib/observability";

const PROJECT_ID = "wpbearckdinjlzwwobqq";

function getFallbackUrl(baseUrl: string, sessionId: string) {
  return `${baseUrl}/welcome?session_id=${encodeURIComponent(sessionId)}`;
}

function normalizeRedirectUrl(raw: unknown, baseUrl: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const target = new URL(raw, baseUrl);
    const appOrigin = new URL(baseUrl).origin;
    if (target.origin !== appOrigin) return null;
    return target.toString();
  } catch {
    return null;
  }
}

function pickRedirectUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const direct = record.redirectUrl ?? record.redirect_url;
  if (typeof direct === "string") return direct;
  const nested = record.data;
  if (nested && typeof nested === "object") {
    const dataRecord = nested as Record<string, unknown>;
    const nestedValue = dataRecord.redirectUrl ?? dataRecord.redirect_url;
    if (typeof nestedValue === "string") return nestedValue;
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  if (!sessionId) {
    return NextResponse.redirect(new URL("/pricing", baseUrl));
  }

  const fallback = getFallbackUrl(baseUrl, sessionId);
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer"],
    });

    const email =
      session.customer_details?.email?.trim() ??
      session.customer_email?.trim() ??
      (session.customer &&
      typeof session.customer === "object" &&
      "email" in session.customer &&
      typeof session.customer.email === "string"
        ? session.customer.email.trim()
        : null);
    const userId =
      (session.metadata?.subscriber_id as string | undefined)?.trim() ??
      (session.client_reference_id ?? "").trim() ??
      null;

    const apiKey = process.env.MINDSTUDIO_API_KEY;
    const workerId = process.env.MINDSTUDIO_WORKER_ID;
    if (!apiKey || !workerId) {
      return NextResponse.redirect(new URL(fallback, baseUrl));
    }

    const msRes = await fetch(`https://api.mindstudio.ai/v1/workers/${workerId}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variables: {
          event: "success",
          projectId: PROJECT_ID,
          sessionId,
          user: {
            email,
            id: userId,
          },
        },
      }),
    });

    if (!msRes.ok) {
      return NextResponse.redirect(new URL(fallback, baseUrl));
    }

    const contentType = msRes.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.redirect(new URL(fallback, baseUrl));
    }

    const payload = (await msRes.json()) as unknown;
    const rawRedirect = pickRedirectUrl(payload);
    const resolved = normalizeRedirectUrl(rawRedirect, baseUrl) ?? fallback;
    return NextResponse.redirect(new URL(resolved, baseUrl));
  } catch (error) {
    logError("billing_success_redirect_failed", error, { sessionId });
    return NextResponse.redirect(new URL(fallback, baseUrl));
  }
}
