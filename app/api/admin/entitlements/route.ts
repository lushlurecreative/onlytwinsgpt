import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { hasActiveSubscription } from "@/lib/subscriptions";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const creatorId = url.searchParams.get("creatorId")?.trim() ?? "";
  const viewerId = url.searchParams.get("viewerId")?.trim() ?? "";

  if (!creatorId || !isUuid(creatorId)) {
    return NextResponse.json({ error: "Valid creatorId is required" }, { status: 400 });
  }
  if (viewerId && !isUuid(viewerId)) {
    return NextResponse.json({ error: "viewerId must be UUID when provided" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const [{ count: publicCount }, { count: subscriberCount }] = await Promise.all([
    admin
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("creator_id", creatorId)
      .eq("is_published", true)
      .eq("visibility", "public"),
    admin
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("creator_id", creatorId)
      .eq("is_published", true)
      .eq("visibility", "subscribers"),
  ]);

  const ownerHasAccess = true;
  const anonymousVisibleCount = publicCount ?? 0;

  let viewerHasSubscription = false;
  let viewerVisibleCount = anonymousVisibleCount;
  let viewerSubscriptionRows: {
    id: string;
    status: string;
    current_period_end: string | null;
    canceled_at: string | null;
  }[] = [];
  if (viewerId) {
    viewerHasSubscription = await hasActiveSubscription(admin, viewerId, creatorId);
    viewerVisibleCount = viewerHasSubscription
      ? (publicCount ?? 0) + (subscriberCount ?? 0)
      : (publicCount ?? 0);

    const { data } = await admin
      .from("subscriptions")
      .select("id, status, current_period_end, canceled_at")
      .eq("creator_id", creatorId)
      .eq("subscriber_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(5);
    viewerSubscriptionRows = (data ?? []) as {
      id: string;
      status: string;
      current_period_end: string | null;
      canceled_at: string | null;
    }[];
  }

  return NextResponse.json(
    {
      creatorId,
      viewerId: viewerId || null,
      matrix: {
        ownerHasSubscriberAccess: ownerHasAccess,
        anonymousVisibleCount,
        viewerHasSubscription,
        viewerVisibleCount,
        expectedSubscriberOnlyLockedForAnonymous: subscriberCount ?? 0,
        expectedSubscriberVisibleWhenActive: (publicCount ?? 0) + (subscriberCount ?? 0),
        viewerSubscriptionRows,
      },
    },
    { status: 200 }
  );
}

