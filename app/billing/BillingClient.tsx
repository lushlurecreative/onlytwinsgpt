"use client";

import { useState } from "react";
import Link from "next/link";

type BillingClientProps = {
  planName: string;
  planKey: string | null;
  status: string;
  renewalLabel: string;
  allowanceSummary: string;
  canUpgrade: boolean;
  whatsappLink: string;
  whatsappDisplay: string;
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const label =
    s === "active" ? "Active" :
    s === "trialing" ? "Trialing" :
    s === "past_due" ? "Past due" :
    s === "canceled" ? "Canceled" :
    "Unknown";
  const color =
    s === "active" ? "#22c55e" :
    s === "trialing" ? "var(--accent)" :
    s === "past_due" ? "#f59e0b" :
    s === "canceled" ? "#ef4444" :
    "var(--muted)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
        letterSpacing: "0.3px",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

export default function BillingClient({
  planName,
  planKey,
  status,
  renewalLabel,
  allowanceSummary,
  canUpgrade,
  whatsappLink,
  whatsappDisplay,
}: BillingClientProps) {
  const [cancelStep, setCancelStep] = useState<"idle" | "confirm" | "loading" | "done" | "error">(
    "idle"
  );
  const [cancelError, setCancelError] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  const isCanceled = status.toLowerCase() === "canceled";

  async function confirmCancel() {
    setCancelStep("loading");
    setCancelError("");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { cancelled?: boolean; error?: string };
      if (!res.ok || !data.cancelled) {
        setCancelStep("error");
        setCancelError(data.error ?? "Could not cancel. Please contact support.");
        return;
      }
      setCancelStep("done");
    } catch {
      setCancelStep("error");
      setCancelError("Unexpected error. Please contact support.");
    }
  }

  async function openPaymentPortal() {
    setPortalLoading(true);
    setPortalError("");
    try {
      const returnUrl =
        typeof window !== "undefined" ? `${window.location.origin}/billing` : undefined;
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to open");
      window.location.href = data.url;
    } catch (e) {
      setPortalError(e instanceof Error ? e.message : "Could not open payment manager.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            margin: "0 0 6px",
            color: "var(--accent-strong)",
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}
        >
          Account
        </p>
        <h1
          style={{ margin: 0, fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em" }}
        >
          Billing
        </h1>
      </div>

      {/* Plan card */}
      <div
        style={{
          borderRadius: 20,
          border: "1px solid var(--border-accent)",
          background:
            "radial-gradient(800px 300px at 90% -20%, rgba(0,174,239,0.08), transparent 70%), var(--surface)",
          padding: "28px 28px 24px",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <p
              style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}
            >
              Current plan
            </p>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {planName}
            </h2>
          </div>
          {statusBadge(status)}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "14px 16px",
              border: "1px solid var(--line)",
            }}
          >
            <p style={{ margin: "0 0 3px", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}>
              Renewal
            </p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{renewalLabel}</p>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "14px 16px",
              border: "1px solid var(--line)",
            }}
          >
            <p style={{ margin: "0 0 3px", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}>
              Monthly allowance
            </p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{allowanceSummary}</p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {canUpgrade && !isCanceled && (
            <Link
              href="/upgrade"
              className="btn btn-primary"
              style={{ fontSize: 14, padding: "10px 20px" }}
            >
              Upgrade plan
            </Link>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void openPaymentPortal()}
            disabled={portalLoading}
            style={{ fontSize: 14, padding: "10px 20px", cursor: portalLoading ? "not-allowed" : "pointer" }}
          >
            {portalLoading ? "Opening…" : "Update payment method"}
          </button>
          {!isCanceled && cancelStep === "idle" && (
            <button
              type="button"
              className="btn"
              onClick={() => setCancelStep("confirm")}
              style={{
                fontSize: 14,
                padding: "10px 20px",
                color: "#ef4444",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              Cancel subscription
            </button>
          )}
        </div>

        {portalError ? (
          <p style={{ margin: "10px 0 0", color: "#ef4444", fontSize: 13 }}>{portalError}</p>
        ) : null}
      </div>

      {/* Cancel confirmation */}
      {cancelStep === "confirm" && (
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.06)",
            padding: "20px 24px",
            marginBottom: 12,
          }}
        >
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15, color: "#ef4444" }}>
            Cancel your subscription?
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
            Your access continues until the end of the current billing period. After that, no further charges will be made and your content generation will stop.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => void confirmCancel()}
              style={{
                fontSize: 14,
                padding: "9px 18px",
                color: "#fff",
                background: "#ef4444",
                border: "none",
              }}
            >
              Yes, cancel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCancelStep("idle")}
              style={{ fontSize: 14, padding: "9px 18px" }}
            >
              Keep subscription
            </button>
          </div>
        </div>
      )}

      {cancelStep === "loading" && (
        <div
          style={{
            borderRadius: 16,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            padding: "20px 24px",
            marginBottom: 12,
            color: "var(--muted)",
            fontSize: 14,
          }}
        >
          Cancelling…
        </div>
      )}

      {cancelStep === "done" && (
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.06)",
            padding: "20px 24px",
            marginBottom: 12,
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "#22c55e" }}>
            Subscription cancelled
          </p>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
            Your access continues until the end of this billing period. We hope to see you again.
          </p>
        </div>
      )}

      {cancelStep === "error" && (
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.06)",
            padding: "20px 24px",
            marginBottom: 12,
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "#ef4444" }}>
            Something went wrong
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--muted)" }}>{cancelError}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setCancelStep("idle")}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Referral promo */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid var(--border-accent)",
          background: "radial-gradient(600px 200px at 0% 50%, rgba(0,174,239,0.08), transparent 70%), var(--surface)",
          padding: "20px 24px",
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15 }}>
            Get 20% off — refer a friend
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Share your personal referral link. When they subscribe, your next cycle is 20% off.
          </p>
        </div>
        <Link
          href="/referrals"
          className="btn btn-primary"
          style={{ fontSize: 13, padding: "9px 20px", whiteSpace: "nowrap" }}
        >
          Get my link →
        </Link>
      </div>

      {/* Support */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: 14 }}>Need billing help?</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Message us directly and we&apos;ll sort it out.
          </p>
        </div>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: "9px 18px", whiteSpace: "nowrap" }}
        >
          WhatsApp: {whatsappDisplay}
        </a>
      </div>
    </div>
  );
}
