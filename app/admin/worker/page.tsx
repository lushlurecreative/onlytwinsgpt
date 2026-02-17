import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import Link from "next/link";
import AdminWorkerClient from "./AdminWorkerClient";

export default async function AdminWorkerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/worker");
  }

  if (!isAdminUser(user.id)) {
    return <p>Access denied.</p>;
  }

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>GPU worker</h1>
      <p className="muted">
        Control the RunPod Serverless backend from here. Set your RunPod API key and endpoint ID so the app sends training and generation jobs. No terminal or RunPod console needed.
      </p>
      <AdminWorkerClient />
    </div>
  );
}
