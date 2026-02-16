import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/upload");
  }

  // Keep /upload as a compatibility alias; the intended flow is /vault.
  redirect("/vault");
}
