import type { SupabaseClient } from "@supabase/supabase-js";

type EligibilityResult = {
  normalizedEmail: string;
  userId: string | null;
  hasConvertedLead: boolean;
  hasValidOnboardingState: boolean;
  canAccessWelcome: boolean;
};

export async function getWelcomeEligibilityByEmail(
  admin: SupabaseClient,
  email: string
): Promise<EligibilityResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      normalizedEmail,
      userId: null,
      hasConvertedLead: false,
      hasValidOnboardingState: false,
      canAccessWelcome: false,
    };
  }

  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 500 });
  const authUser = listData?.users?.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  );
  const userId = authUser?.id ?? null;
  if (!userId) {
    return {
      normalizedEmail,
      userId: null,
      hasConvertedLead: false,
      hasValidOnboardingState: false,
      canAccessWelcome: false,
    };
  }

  const { data: profileData } = await admin
    .from("profiles")
    .select("onboarding_pending")
    .eq("id", userId)
    .maybeSingle();
  const hasValidOnboardingState = !!(profileData as { onboarding_pending?: boolean } | null)
    ?.onboarding_pending;

  let hasConvertedLead = false;
  const { data: events } = await admin
    .from("automation_events")
    .select("event_type, entity_type, payload_json")
    .eq("event_type", "converted")
    .eq("entity_type", "lead")
    .order("created_at", { ascending: false })
    .limit(200);
  hasConvertedLead = (events ?? []).some((evt) => {
    const payload = (evt as { payload_json?: Record<string, unknown> | null }).payload_json ?? {};
    return String(payload["subscriber_id"] ?? "") === userId;
  });

  return {
    normalizedEmail,
    userId,
    hasConvertedLead,
    hasValidOnboardingState,
    canAccessWelcome: hasConvertedLead || hasValidOnboardingState,
  };
}
