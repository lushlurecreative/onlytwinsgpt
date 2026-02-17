import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import Link from "next/link";
import AdminSubjectsClient from "./AdminSubjectsClient";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export default async function AdminSubjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/subjects");
  }

  if (!isAdminUser(user.id)) {
    return <p>Access denied.</p>;
  }

  const admin = getSupabaseAdmin();
  const { data: rows, error } = await admin
    .from("subjects")
    .select("id, user_id, label, consent_status, consent_signed_at, identity_verified_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const subjects = (rows ?? []) as Array<{
    id: string;
    user_id: string;
    label: string | null;
    consent_status: string;
    consent_signed_at: string | null;
    identity_verified_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Subjects (consent)</h1>
      <p className="muted">Approve or revoke consent for digital twin training and generation.</p>
      {error && (
        <p style={{ color: "red", marginBottom: 16 }}>
          Database error: {error.message}. Run the RLS policy SQL in Supabase (see README or ask support).
        </p>
      )}
      <p style={{ marginBottom: 16 }}>{subjects.length} subject(s) loaded.</p>
      <AdminSubjectsClient initialSubjects={subjects} />
    </div>
  );
}
