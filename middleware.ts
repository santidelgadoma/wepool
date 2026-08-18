import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js y manifest.webmanifest se agregan aquí (PWA, ver app/manifest.ts
    // y public/sw.js): se piden en cada carga de la app, incluso sin sesión,
    // así que no tiene sentido pasarlos por Supabase en cada request.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
