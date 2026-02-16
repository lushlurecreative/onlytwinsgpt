import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function CreatorOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding/creator");
  }

  // Legacy route kept for compatibility. Primary onboarding is now /vault.
  redirect("/vault");
}

