import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nombreInstitucion } from "@/lib/institucion";
import { AppNav } from "@/components/app-nav";
import { SolicitudCard } from "@/components/solicitud-card";
import { obtenerSolicitudesPendientesConductor } from "@/lib/actions/solicitudes";

// El middleware ya rebota a /login si no hay sesión, pero se vuelve a
// verificar aquí (defensa en profundidad) para que este layout nunca
// renderice contenido protegido sin usuario.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Nombre de la institución del usuario, para el branding del header — el
  // producto es institucional (ver PROGRESS.md, "Modelo de negocio / pitch"),
  // así que el header debe reflejar de qué comunidad es cada quien, no solo
  // mostrar el nombre de una sola institución fijo.
  const { data: profile } = await supabase
    .from("profiles")
    .select("institutions(name)")
    .eq("id", user.id)
    .single();

  const institucion = nombreInstitucion(profile?.institutions);

  // Notificación urgente (ver PROGRESS.md, "Solicitudes urgentes"): si el
  // usuario tiene alguna oferta de conductor con una solicitud de pasajero
  // pendiente de responder, se muestra un banner imposible de ignorar en
  // TODAS las pantallas (no solo en /home o /consultar) -- se consulta en
  // cada carga del layout, así que aparece sin importar dónde esté
  // navegando en el momento en que le llega una solicitud.
  const solicitudesPendientes = await obtenerSolicitudesPendientesConductor();

  // App-shell de altura fija (ver PROGRESS.md, pedido del 2026-08-26 "scroll
  // fijo con mínimo de tres viajes visibles" -- mockup aprobado en Claude
  // Design): el layout entero ocupa exactamente el alto del viewport
  // (`h-[100dvh] overflow-hidden`, en vez del `min-h-screen` de siempre, que
  // dejaba que la página completa scrolleara). Header y AppNav son
  // `flex-shrink-0` -- se quedan fijos arriba y abajo genuinamente porque son
  // los extremos de una columna flex de alto fijo, no por `position:sticky`
  // (que en la implementación anterior de AppNav no funcionaba: al ser el
  // último hijo de un documento con scroll normal, "sticky" no tenía nada
  // respecto a qué pegarse). El único que scrollea es <main>; cada pantalla
  // decide internamente si necesita partir su propio contenido en una franja
  // fija + una franja con scroll (ver app/(app)/home/page.tsx) o simplemente
  // dejar que <main> entero scrollee (todas las demás pantallas, sin cambios
  // de comportamiento respecto a antes).
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-4xl items-center p-4">
          <Link href="/home" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono
                fijo de 28px, next/image no aporta nada aquí */}
            <img src="/logo-mascot.png" alt="" className="h-7 w-7 shrink-0" />
            <span className="whitespace-nowrap">
              WEPOOL
              {institucion && (
                <span className="font-normal text-muted-foreground"> · {institucion}</span>
              )}
            </span>
          </Link>
        </div>
      </header>
      {solicitudesPendientes.length > 0 && (
        <div className="flex-shrink-0 border-b bg-amber-50/80">
          <div className="mx-auto w-full max-w-4xl space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              {solicitudesPendientes.length === 1
                ? "Tienes un pasajero esperando tu respuesta"
                : `Tienes ${solicitudesPendientes.length} pasajeros esperando tu respuesta`}
            </p>
            {solicitudesPendientes.map((solicitud) => (
              <SolicitudCard key={solicitud.matchId} solicitud={solicitud} urgente />
            ))}
          </div>
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full w-full max-w-4xl p-6">{children}</div>
      </main>
      <AppNav />
    </div>
  );
}
