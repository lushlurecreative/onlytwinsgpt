import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

export async function POST() {
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

  // Provider integration points:
  // - Adult site lead sources
  // - Social source scrapers
  // This endpoint is wired for orchestration; provider keys and parsers are configured per deployment.
  return NextResponse.json(
    {
      imported: 0,
      message:
        "Scrape orchestration endpoint is active. Configure provider connectors to start automatic imports.",
    },
    { status: 200 }
  );
}

