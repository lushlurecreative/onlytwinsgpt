import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import Link from "next/link";
import AdminWatermarkClient from "./AdminWatermarkClient";

export default async function AdminWatermarkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/admin/watermark");
  if (!isAdminUser(user.id)) return <p>Access denied.</p>;

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Watermark decode</h1>
      <p className="muted">
        Upload a suspected leaked image. If it contains our forensic watermark, you’ll see lead/user, job, and tamper status.
      </p>
      <AdminWatermarkClient />
    </div>
  );
}
