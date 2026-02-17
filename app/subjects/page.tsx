import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import SubjectsClient from "./SubjectsClient";

export default async function SubjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/subjects");
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>My digital twin</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Create a subject and get consent approved to use generation and training. You need 30–60 photos in your vault to start training.
      </p>
      <SubjectsClient userId={user.id} />
    </main>
  );
}
