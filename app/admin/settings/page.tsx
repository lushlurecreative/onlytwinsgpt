import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import Link from "next/link";
import AdminSettingsClient from "./AdminSettingsClient";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/admin/settings");
  if (!isAdminUser(user.id)) return <p>Access denied.</p>;

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <p className="muted">Configure the pipeline and optional tools.</p>
      <AdminSettingsClient />
      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced</summary>
        <ul style={{ marginTop: 8, marginBottom: 0 }}>
          <li><Link href="/admin/worker">RunPod (GPU worker)</Link></li>
          <li><Link href="/admin/cost">Cost & GPU usage</Link></li>
          <li><Link href="/admin/watermark">Watermark decode</Link></li>
          <li><Link href="/admin/generation-requests">Generation requests</Link></li>
          <li><Link href="/admin/webhook-health">Webhooks</Link></li>
          <li><Link href="/admin/diagnostics">Diagnostics</Link></li>
          <li><Link href="/admin/automation">Automation triggers</Link></li>
        </ul>
      </details>
    </section>
  );
}
