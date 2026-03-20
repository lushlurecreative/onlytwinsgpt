import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import GenerationQueueClient from "./GenerationQueueClient";

export const dynamic = "force-dynamic";

export default async function GenerationQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/admin/generation-queue");
  if (!isAdminUser(user.id, user.email)) redirect("/dashboard?unauthorized=admin");

  return (
    <section>
      <GenerationQueueClient />
    </section>
  );
}
