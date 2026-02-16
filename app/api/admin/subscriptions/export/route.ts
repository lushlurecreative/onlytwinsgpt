import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SubscriptionExportRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
};

function csvEscape(value: string | null | undefined) {
  const raw = value ?? "";
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

export async function GET() {
  const session = await createClient();
  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id, creator_id, subscriber_id, status, current_period_end, canceled_at, created_at, stripe_subscription_id, stripe_price_id"
    )
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const header = [
    "id",
    "creator_id",
    "subscriber_id",
    "status",
    "current_period_end",
    "canceled_at",
    "created_at",
    "stripe_subscription_id",
    "stripe_price_id",
  ].join(",");
  const lines = ((data ?? []) as SubscriptionExportRow[]).map((row) =>
    [
      row.id,
      row.creator_id,
      row.subscriber_id,
      row.status,
      row.current_period_end,
      row.canceled_at,
      row.created_at,
      row.stripe_subscription_id,
      row.stripe_price_id,
    ]
      .map((v) => csvEscape(v as string | null))
      .join(",")
  );
  const csv = [header, ...lines].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions-export.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

