import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import ResultsMarketing from "./ResultsMarketing";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users go straight to their actual content
  if (user) {
    redirect("/library");
  }

  // Guests see the marketing results page
  return <ResultsMarketing />;
}
