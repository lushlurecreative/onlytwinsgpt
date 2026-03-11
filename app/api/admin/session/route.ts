import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ authenticated: false, email: null, isAdmin: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      authenticated: true,
      email: user.email ?? null,
      isAdmin: isAdminUser(user.id, user.email),
      userId: user.id,
    },
    { status: 200 }
  );
}
