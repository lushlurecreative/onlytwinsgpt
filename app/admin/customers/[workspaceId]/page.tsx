import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";
import AdminCustomerDetailClient from "./AdminCustomerDetailClient";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function AdminCustomerDetailPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/admin/customers/${workspaceId}`);
  }
  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }

  const serviceCreatorId = getServiceCreatorId();

  const [
    subRes,
    profileRes,
    subjectRes,
    genReqsRes,
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, stripe_price_id, current_period_end, created_at, canceled_at")
      .eq("creator_id", serviceCreatorId)
      .eq("subscriber_id", workspaceId)
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("id", workspaceId).maybeSingle(),
    supabase.from("subjects").select("id").eq("user_id", workspaceId).maybeSingle(),
    supabase
      .from("generation_requests")
      .select("id, scene_preset, status, created_at, output_paths")
      .eq("user_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const sub = subRes.data as { status: string; stripe_price_id: string | null; current_period_end: string | null } | null;
  const profile = profileRes.data as { full_name?: string | null } | null;
  const subject = subjectRes.data as { id: string } | null;
  const genReqs = (genReqsRes.data ?? []) as { id: string; scene_preset: string; status: string; created_at: string; output_paths: string[] }[];

  let datasetStatus = "not_ready";
  let trainingStatus = "Not Trained";
  let lastTrainingDate: string | null = null;
  let activeModelVersion: string | null = null;

  if (subject) {
    datasetStatus = "ready";
    const [modelsRes, jobsRes] = await Promise.all([
      supabase.from("subjects_models").select("training_status, lora_model_reference").eq("subject_id", subject.id).maybeSingle(),
      supabase.from("training_jobs").select("status, finished_at").eq("subject_id", subject.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const sm = modelsRes.data as { training_status: string; lora_model_reference: string | null } | null;
    const tj = jobsRes.data as { status: string; finished_at: string | null } | null;
    if (sm) {
      trainingStatus = sm.training_status === "completed" ? "Trained" : sm.training_status === "training" ? "Training" : sm.training_status === "failed" ? "Failed" : "Not Trained";
      activeModelVersion = sm.lora_model_reference;
    }
    if (tj?.finished_at) lastTrainingDate = tj.finished_at;
  }

  const generations = genReqs.map((g) => ({
    id: g.id,
    scene_preset: g.scene_preset,
    status: g.status,
    created_at: g.created_at,
    output_paths: g.output_paths ?? [],
  }));

  const assets: { path: string; createdAt: string; requestId?: string }[] = [];
  for (const g of genReqs) {
    const paths = (g.output_paths ?? []) as string[];
    const created = g.created_at;
    for (const path of paths) {
      if (path && typeof path === "string") assets.push({ path, createdAt: created, requestId: g.id });
    }
  }

  const failures: { id: string; type: "training" | "generation"; message: string; lastError?: string }[] = [];
  for (const g of genReqs) {
    if (g.status === "failed") failures.push({ id: g.id, type: "generation", message: `Job ${g.id.slice(0, 8)}` });
  }

  const displayName =
    profile?.full_name?.trim() || workspaceId.slice(0, 8) + "…";

  return (
    <section>
      <p style={{ marginBottom: 8 }}>
        <Link href="/admin/customers">← Back to customers</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>Customer: {displayName}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        <code>{workspaceId}</code>
      </p>
      <AdminCustomerDetailClient
        workspaceId={workspaceId}
        subscription={sub ? { status: sub.status, stripe_price_id: sub.stripe_price_id, current_period_end: sub.current_period_end } : null}
        training={{
          datasetStatus,
          trainingStatus,
          lastTrainingDate,
          activeModelVersion,
        }}
        generations={generations}
        assets={assets}
        failures={failures}
      />
    </section>
  );
}
