import { createServerClient } from "@supabase/ssr";
import type { Session, SupabaseClient, User, UserResponse } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getBypassUser, isAuthBypassed } from "@/lib/auth-bypass";

export async function createClient() {
  if (isAuthBypassed()) {
    const admin = getSupabaseAdmin() as unknown as SupabaseClient & { __authBypassPatched?: boolean };
    const bypassUser = getBypassUser() as unknown as User;
    const bypassSession = ({ user: bypassUser } as unknown) as Session;

    if (!admin.__authBypassPatched) {
      type PatchedSessionResponse = { data: { session: Session }; error: null };
      const patchedAuth = {
        ...admin.auth,
        getUser: async (_jwt?: string) => {
          void _jwt;
          return { data: { user: bypassUser }, error: null } as UserResponse;
        },
        getSession: async () =>
          ({ data: { session: bypassSession }, error: null } as PatchedSessionResponse),
      } as unknown as SupabaseClient["auth"];

      admin.auth = patchedAuth;
      admin.__authBypassPatched = true;
    }

    return admin;
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored if using proxy refreshing
          }
        },
      },
    }
  );
}
