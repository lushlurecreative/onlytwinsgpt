import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type EventRow = {
  id: string;
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
    .select("id, event_type, received_at, processed_at")
    .order("received_at", { ascending: false })
    .limit(2000);

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") {
      return NextResponse.json(
        {
          summary: {
            total: 0,
            processed: 0,
            pending: 0,
            stalePendingOver10m: 0,
            p95ProcessingSeconds: 0,
          },
          stalePending: [],
          warning: "stripe_webhook_events table missing.",
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as EventRow[];
  const nowMs = Date.now();
  const pending = rows.filter((r) => !r.processed_at);
  const stalePending = pending.filter((r) => nowMs - new Date(r.received_at).getTime() > 10 * 60 * 1000);
  const eventTypeBreakdown = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.event_type] = (acc[row.event_type] ?? 0) + 1;
    return acc;
  }, {});

  const durations = rows
    .filter((r) => r.processed_at)
    .map((r) => {
      const d = (new Date(r.processed_at as string).getTime() - new Date(r.received_at).getTime()) / 1000;
      return Number.isFinite(d) && d >= 0 ? d : 0;
    })
    .sort((a, b) => a - b);
  const p95Idx = durations.length > 0 ? Math.floor(durations.length * 0.95) : 0;
  const p95ProcessingSeconds = durations.length > 0 ? Math.round(durations[p95Idx]) : 0;

  return NextResponse.json(
    {
      summary: {
        total: rows.length,
        processed: rows.length - pending.length,
        pending: pending.length,
        stalePendingOver10m: stalePending.length,
        p95ProcessingSeconds,
      },
      eventTypeBreakdown,
      stalePending: stalePending.slice(0, 100),
    },
    { status: 200 }
  );
}

