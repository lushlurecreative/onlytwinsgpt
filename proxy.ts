import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/security-config";
import { isAuthBypassed } from "@/lib/auth-bypass";

const PROTECTED_ROUTES = ["/upload", "/admin"];

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
  return response;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response = applySecurityHeaders(response);

  const pathname = request.nextUrl.pathname;
  const ip = getClientIpFromHeaders(request.headers);

  if (isAuthBypassed()) {
    return response;
  }

  if (pathname === "/login") {
    const rl = checkRateLimit(
      `auth-login-page:${ip}`,
      RATE_LIMITS.authLoginPage.limit,
      RATE_LIMITS.authLoginPage.windowMs
    );
    if (!rl.allowed) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Too many login page requests. Please try again shortly." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        )
      );
    }
  }

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!isProtected) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

