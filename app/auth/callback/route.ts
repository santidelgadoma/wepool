import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Adonde llega el usuario después de dar clic en el link mágico del correo
// de confirmación. Supabase manda un `code` (flujo PKCE) que hay que
// intercambiar por una sesión real antes de mandarlo a /home.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Si el código es inválido o ya se usó, manda a login con un aviso.
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(loginUrl);
}
