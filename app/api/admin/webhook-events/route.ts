import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type WebhookEventRow = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("id, stripe_event_id, event_type, received_at, processed_at")
    .order("received_at", { ascending: false })
    .limit(200);

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") {
      return NextResponse.json(
        {
          events: [],
          warning:
            "stripe_webhook_events table missing. Run latest Supabase migration to enable event logs.",
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as WebhookEventRow[];
  const summary = {
    total: rows.length,
    processed: rows.filter((r) => !!r.processed_at).length,
    unprocessed: rows.filter((r) => !r.processed_at).length,
  };

  return NextResponse.json({ events: rows, summary }, { status: 200 });
}

