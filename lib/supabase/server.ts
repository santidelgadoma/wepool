import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * En Next.js 15 `cookies()` es asíncrono, así que esta función también lo es:
 * úsala siempre como `const supabase = await createClient()`.
 */
export async function createClient() {
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
            // Se puede ignorar si un Server Component intenta escribir cookies:
            // el middleware (lib/supabase/middleware.ts) ya se encarga de
            // refrescar la sesión en cada request.
          }
        },
      },
    }
  );
}
