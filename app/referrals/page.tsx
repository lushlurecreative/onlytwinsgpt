import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import ReferralsClient from "./ReferralsClient";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/referrals");
  }

  await requireActiveSubscriber("/referrals");

  return (
    <main style={{ padding: "32px 24px", maxWidth: 780, margin: "0 auto" }}>
      <ReferralsClient />
    </main>
  );
}
