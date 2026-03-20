import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import ProfileSetupClient from "./ProfileSetupClient";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function ProfileSetupPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Admins skip profile setup.
  if (isAdminUser(user.id, user.email)) {
    redirect("/admin");
  }

  // If already complete, skip ahead.
  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.profile_complete) {
    redirect(next ?? "/dashboard");
  }

  return <ProfileSetupClient next={next ?? "/dashboard"} />;
}
