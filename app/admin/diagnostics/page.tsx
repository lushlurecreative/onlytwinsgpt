import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { DEFAULT_MAX_UPLOAD_BYTES, getMaxUploadBytes, RATE_LIMITS } from "@/lib/security-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export default async function AdminDiagnosticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/diagnostics");
  }

  if (!isAdminUser(user.id)) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Admin Diagnostics</h1>
        <p>❌ Access denied. Your user is not in ADMIN_USER_IDS.</p>
      </main>
    );
  }

  const maxUploadBytes = getMaxUploadBytes();
  const maxUploadMb = (maxUploadBytes / (1024 * 1024)).toFixed(2);
  const alertConfigured = Boolean(process.env.ALERT_WEBHOOK_URL);

  const envChecks = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { key: "SUPABASE_SERVICE_ROLE_KEY", ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { key: "STRIPE_SECRET_KEY", ok: Boolean(process.env.STRIPE_SECRET_KEY) },
    { key: "STRIPE_WEBHOOK_SECRET", ok: Boolean(process.env.STRIPE_WEBHOOK_SECRET) },
    { key: "ADMIN_USER_IDS", ok: Boolean(process.env.ADMIN_USER_IDS) },
  ];

  const aiEnvChecks = [
    { key: "OPENAI_API_KEY", ok: Boolean(process.env.OPENAI_API_KEY) },
    { key: "REPLICATE_API_TOKEN", ok: Boolean(process.env.REPLICATE_API_TOKEN) },
    { key: "FAL_KEY", ok: Boolean(process.env.FAL_KEY) },
    { key: "COINBASE_COMMERCE_API_KEY", ok: Boolean(process.env.COINBASE_COMMERCE_API_KEY) },
    { key: "ANTIGRAVITY_WEBHOOK_SECRET", ok: Boolean(process.env.ANTIGRAVITY_WEBHOOK_SECRET) },
    { key: "DATABASE_URL", ok: Boolean(process.env.DATABASE_URL) },
  ];

  let tableChecks:
    | { table: string; ok: boolean; detail?: string }[]
    | null = null;
  try {
    const admin = getSupabaseAdmin();
    const tables = ["profiles", "posts", "subscriptions", "generation_requests", "leads"];
    const checks: { table: string; ok: boolean; detail?: string }[] = [];
    for (const table of tables) {
      const { error } = await admin.from(table).select("id", { head: true }).limit(1);
      checks.push({
        table,
        ok: !error,
        detail: error ? error.message : undefined,
      });
    }
    tableChecks = checks;
  } catch (e) {
    tableChecks = [
      {
        table: "service_role",
        ok: false,
        detail: e instanceof Error ? e.message : "Unable to initialize admin client",
      },
    ];
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Admin Diagnostics</h2>
        <p className="muted">This page checks wiring without exposing secrets.</p>
        <p>✅ Admin access granted</p>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Environment</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 720 }}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {envChecks.map((c) => (
                <tr key={c.key}>
                  <td>
                    <code>{c.key}</code>
                  </td>
                  <td>{c.ok ? "OK" : "Missing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>AI + Payments</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Add these in Vercel: Project Settings → Environment Variables. Redeploy after adding.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 720 }}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {aiEnvChecks.map((c) => (
                <tr key={c.key}>
                  <td>
                    <code>{c.key}</code>
                  </td>
                  <td>{c.ok ? "OK" : "Missing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Database tables</h3>
        <p className="muted">
          Add DATABASE_URL (Supabase → Project Settings → Database → Connection string) to Vercel to run migrations automatically when you load admin/leads. Otherwise apply migrations manually in Supabase SQL editor.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", minWidth: 720 }}>
            <thead>
              <tr>
                <th>Table</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {(tableChecks ?? []).map((c) => (
                <tr key={c.table}>
                  <td>
                    <code>{c.table}</code>
                  </td>
                  <td>{c.ok ? "OK" : "Missing / blocked"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {c.detail ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Secrets are intentionally not shown on this page.
        </p>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Rate limits</h3>
        <ul>
          <li>
            Login page: {RATE_LIMITS.authLoginPage.limit} req /{" "}
            {RATE_LIMITS.authLoginPage.windowMs / 1000}s
          </li>
          <li>
            Uploads: {RATE_LIMITS.uploads.limit} req / {RATE_LIMITS.uploads.windowMs / 1000}s
          </li>
          <li>
            Billing checkout: {RATE_LIMITS.billingCheckout.limit} req /{" "}
            {RATE_LIMITS.billingCheckout.windowMs / 1000}s
          </li>
          <li>
            Billing webhook: {RATE_LIMITS.billingWebhook.limit} req /{" "}
            {RATE_LIMITS.billingWebhook.windowMs / 1000}s
          </li>
        </ul>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Upload limits</h3>
        <ul>
          <li>
            MAX_UPLOAD_BYTES (effective): {maxUploadBytes} bytes ({maxUploadMb} MB)
          </li>
          <li>Default fallback: {DEFAULT_MAX_UPLOAD_BYTES} bytes</li>
        </ul>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Observability</h3>
        <ul>
          <li>Structured logging: enabled</li>
          <li>Alert webhook configured: {alertConfigured ? "Yes" : "No"}</li>
        </ul>
      </section>
    </div>
  );
}

