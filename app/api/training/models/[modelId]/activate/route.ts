import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { setActiveModel } from "@/lib/identity-models";

type Params = { params: Promise<{ modelId: string }> };

/**
 * POST: Set a specific model as the active model for the authenticated user.
 */
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { modelId } = await params;
  const success = await setActiveModel(user.id, modelId);
  if (!success) {
    return NextResponse.json(
      { error: "Model not found or not ready" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, activeModelId: modelId });
}
