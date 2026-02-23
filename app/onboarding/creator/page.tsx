import Link from "next/link";
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
    return (
      <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Vault unavailable</h1>
        <p className="muted">Vault access is disabled in test mode for this account.</p>
        <Link href="/start" className="btn btn-primary" style={{ display: "inline-block", marginTop: 16 }}>
          Back to Start
        </Link>
      </main>
    );
  }

  const role = await getUserRole(supabase, user.id);
  if (role === "creator") {
    redirect("/vault");
  }

  return <BecomeCreatorClient />;
}

