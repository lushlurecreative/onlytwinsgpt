import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAdminUser(user.id, user.email)) {
    redirect("/admin");
  }

  return (
    <Suspense fallback={<div />}>
      <HomeClient />
    </Suspense>
  );
}
