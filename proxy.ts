import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/security-config";

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
  const oauthCode = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const sid = request.nextUrl.searchParams.get("sid")?.trim() ?? "";
  const ip = getClientIpFromHeaders(request.headers);

  if (pathname === "/" && oauthCode) {
    const redirectUrl = new URL("/auth/callback", request.url);
    request.nextUrl.searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value);
    });
    if (!redirectUrl.searchParams.get("next")) {
      redirectUrl.searchParams.set("next", "/dashboard");
    }
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  if (pathname === "/thank-you" && sid) {
    const redirectUrl = new URL("/thank-you", request.url);
    const redirect = NextResponse.redirect(redirectUrl);
    redirect.cookies.set("ot_checkout_sid", sid, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 6,
    });
    return applySecurityHeaders(redirect);
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

