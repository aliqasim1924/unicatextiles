import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Root "/" redirect: send to toolbox if authenticated, else to login
  const pathname = request.nextUrl.pathname;
  if (pathname === "/" || pathname === "") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/toolbox" : "/auth/login";
    return NextResponse.redirect(url);
  }

  // Protect /toolbox routes
  if (pathname.startsWith("/toolbox") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (
    (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register")) &&
    user
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/toolbox";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Explicitly match root so redirect always runs (avoids CDN/build caching of old page)
    "/",
    /*
     * Match all other request paths except static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

