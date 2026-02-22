import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, isSuspended } from "@/lib/roles";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/upload");
  }

  if (await isSuspended(supabase, user.id)) {
    redirect("/suspended");
  }

  const role = await getUserRole(supabase, user.id);
  if (role !== "creator") {
    redirect("/onboarding/creator?from=upload");
  }

  redirect("/vault");
}
