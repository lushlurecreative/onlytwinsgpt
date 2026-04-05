import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getModelHistory, getActiveModelForUser } from "@/lib/identity-models";

/**
 * GET: List all model versions for the authenticated user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [models, activeModel] = await Promise.all([
    getModelHistory(user.id),
    getActiveModelForUser(user.id),
  ]);

  return NextResponse.json({
    models: models.map((m) => ({
      id: m.id,
      version: m.version,
      status: m.status,
      isActive: m.is_active,
      baseModel: m.base_model,
      previewImagePath: m.preview_image_path,
      trainingSteps: m.training_steps,
      completedAt: m.completed_at,
      failureReason: m.failure_reason,
      createdAt: m.created_at,
    })),
    activeModelId: activeModel?.id ?? null,
  });
}
