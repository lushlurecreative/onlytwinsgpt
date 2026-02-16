import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin");
  }

  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }

  const admin = getSupabaseAdmin();

  async function countEq(table: string, column: string, value: string) {
    try {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, value);
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  async function countNull(table: string, column: string) {
    try {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .is(column, null);
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  const [
    pendingRequests,
    approvedRequests,
    generatingRequests,
    failedRequests,
    importedLeads,
    approvedLeads,
    pendingWebhooks,
  ] = await Promise.all([
    countEq("generation_requests", "status", "pending"),
    countEq("generation_requests", "status", "approved"),
    countEq("generation_requests", "status", "generating"),
    countEq("generation_requests", "status", "failed"),
    countEq("leads", "status", "imported"),
    countEq("leads", "status", "approved"),
    countNull("stripe_webhook_events", "processed_at"),
  ]);

  return (
    <div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Inbox</h2>
        <p className="muted">The only stuff that matters day-to-day: approvals, generation runs, and webhooks.</p>

        <div className="feature-grid" style={{ marginTop: 10 }}>
          <article className="card">
            <div className="muted">Requests needing review</div>
            <div className="kpi">{pendingRequests ?? "—"}</div>
            <div style={{ marginTop: 10 }}>
              <Link className="btn btn-primary" href="/admin/generation-requests">
                Review queue
              </Link>
            </div>
          </article>
          <article className="card">
            <div className="muted">Approved, ready to generate</div>
            <div className="kpi">{approvedRequests ?? "—"}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Generating: {generatingRequests ?? "—"} · Failed: {failedRequests ?? "—"}
            </div>
          </article>
          <article className="card">
            <div className="muted">Leads awaiting action</div>
            <div className="kpi">{importedLeads ?? "—"}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Approved: {approvedLeads ?? "—"}
            </div>
            <div style={{ marginTop: 10 }}>
              <Link className="btn btn-ghost" href="/admin/leads">
                Lead pipeline
              </Link>
            </div>
          </article>
          <article className="card">
            <div className="muted">Webhook backlog</div>
            <div className="kpi">{pendingWebhooks ?? "—"}</div>
            <div style={{ marginTop: 10 }}>
              <Link className="btn btn-ghost" href="/admin/webhook-health">
                Webhooks
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

