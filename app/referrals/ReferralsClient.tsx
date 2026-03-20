"use client";

import { useEffect, useState } from "react";

type ReferralData = {
  code: string;
  referralUrl: string;
  redeemed: boolean;
  discountApplied: boolean;
};

export default function ReferralsClient() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch("/api/me/referral")
      .then((r) => r.json())
      .then((json: ReferralData) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function copyLink() {
    if (!data?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(data.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select text
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ margin: "0 0 6px", color: "var(--accent-strong)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.3px" }}>
          Referrals
        </p>
        <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
          Earn 20% off for life
        </h1>
        <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}>
          Share your personal link. When someone signs up and subscribes using it, you get 20% off your next billing cycle — applied automatically, no codes needed.
        </p>
      </div>

      {/* Referral link card */}
      <div
        style={{
          borderRadius: 20,
          border: "1px solid var(--border-accent)",
          background:
            "radial-gradient(800px 300px at 50% -20%, rgba(0,174,239,0.1), transparent 70%), var(--surface)",
          padding: "28px 28px 24px",
          marginBottom: 16,
        }}
      >
        <p style={{ margin: "0 0 14px", fontWeight: 600, fontSize: 15 }}>Your referral link</p>

        {loading ? (
          <div
            style={{
              height: 52,
              borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ) : data ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: "var(--muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {data.referralUrl}
              </span>
              <button
                type="button"
                onClick={() => void copyLink()}
                style={{
                  flexShrink: 0,
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: copied ? "rgba(0,174,239,0.2)" : "var(--accent)",
                  color: copied ? "var(--accent-strong)" : "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            {/* Share buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Join me on OnlyTwins — AI content that looks exactly like you. Use my link: ${data.referralUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                Share on WhatsApp
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just discovered OnlyTwins — AI generates content that actually looks like you. Check it out: ${data.referralUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                Share on X
              </a>
            </div>
          </>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Could not load your referral link. Please refresh.
          </p>
        )}
      </div>

      {/* Status card */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          padding: "20px 24px",
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}>
            Referrals redeemed
          </p>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: data?.redeemed ? "var(--accent-strong)" : "var(--text)" }}>
            {loading ? "—" : data?.redeemed ? "1" : "0"}
          </p>
        </div>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}>
            Discount status
          </p>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: data?.discountApplied ? "#22c55e" : "var(--text)" }}>
            {loading ? "—" : data?.discountApplied ? "Applied ✓" : data?.redeemed ? "Pending" : "Not yet"}
          </p>
        </div>
      </div>

      {/* How it works */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          padding: "20px 24px",
        }}
      >
        <p style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 15 }}>How it works</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["Share your link", "Send it to anyone — friends, followers, fans. They get access to OnlyTwins."],
            ["They subscribe", "When they sign up and complete their first paid subscription, your referral is counted."],
            ["You get 20% off", "We automatically apply a 20% discount to your next billing cycle. No codes, no chasing."],
          ].map(([title, desc], i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "var(--accent-soft)",
                  border: "1px solid var(--border-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "var(--accent-strong)",
                  marginTop: 1,
                }}
              >
                {i + 1}
              </div>
              <div>
                <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 14 }}>{title}</p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
