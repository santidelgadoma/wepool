import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// ─── Candado temporal mientras WEPOOL no está listo para mostrarse
// públicamente ────────────────────────────────────────────────────────────
// El dominio ya existe pero el producto sigue en desarrollo — esto cierra
// TODO el sitio detrás de un usuario/contraseña compartido vía HTTP Basic
// Auth (el navegador muestra su propio prompt nativo, sin librería ni
// pantalla nueva). Es un candado a nivel de código, no depende del plan de
// Vercel — bloquear el dominio de producción con la protección nativa de
// Vercel requiere plan Pro+ (ver PROGRESS.md, "Candado temporal de acceso").
//
// Se activa SOLO si SITE_LOCK_PASSWORD está definida como variable de
// entorno (ver env-example.txt). Si no está definida — como en desarrollo
// local mientras no se configure — esta función no hace nada y el sitio se
// comporta exactamente igual que antes. Quitar el candado más adelante es
// borrar esa variable en Vercel y volver a desplegar, sin tocar código.
function candadoDesarrollo(request: NextRequest): NextResponse | null {
  const password = process.env.SITE_LOCK_PASSWORD;
  if (!password) return null;

  const usuario = process.env.SITE_LOCK_USER || "wepool";
  const encabezado = request.headers.get("authorization");

  if (encabezado?.startsWith("Basic ")) {
    // atob (no Buffer) a propósito: Buffer no está garantizado en el Edge
    // Runtime donde corre el middleware, atob sí es una API web estándar
    // soportada ahí. La contraseña puede tener ":" — solo el primer ":"
    // separa usuario de contraseña (igual que hace cualquier cliente HTTP).
    const decodificado = atob(encabezado.slice("Basic ".length));
    const separador = decodificado.indexOf(":");
    const usuarioRecibido = decodificado.slice(0, separador);
    const passwordRecibido = decodificado.slice(separador + 1);
    if (usuarioRecibido === usuario && passwordRecibido === password) {
      return null; // credenciales correctas, deja pasar
    }
  }

  return new NextResponse("Acceso restringido.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="WEPOOL"' },
  });
}

export async function middleware(request: NextRequest) {
  const bloqueado = candadoDesarrollo(request);
  if (bloqueado) return bloqueado;

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
