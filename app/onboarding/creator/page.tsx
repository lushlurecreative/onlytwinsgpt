import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, isSuspended } from "@/lib/roles";
import { getBypassUserId, isAuthBypassed } from "@/lib/auth-bypass";
import BecomeCreatorClient from "./BecomeCreatorClient";

export default async function CreatorOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding/creator");
  }

  if (await isSuspended(supabase, user.id)) {
    redirect("/suspended");
  }

  // When auth is disabled for testing, do not send bypass user to vault (they would see wrong data).
  if (isAuthBypassed() && user.id === getBypassUserId()) {
    redirect("/start");
  }

  const role = await getUserRole(supabase, user.id);
  if (role === "creator") {
    redirect("/vault");
  }

  return <BecomeCreatorClient />;
}

