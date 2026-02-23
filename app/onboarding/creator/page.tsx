import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, isSuspended } from "@/lib/roles";
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

  const role = await getUserRole(supabase, user.id);
  if (role === "creator") {
    redirect("/vault");
  }

  return <BecomeCreatorClient />;
}

