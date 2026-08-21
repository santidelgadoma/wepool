import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nombreInstitucion } from "@/lib/institucion";
import { LogoutButton } from "@/components/logout-button";
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
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
            <div className="sm:hidden">
              <LogoutButton />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <AppNav />
            <div className="hidden shrink-0 sm:block">
              <LogoutButton />
            </div>
          </div>
        </nav>
      </header>
      {solicitudesPendientes.length > 0 && (
        <div className="border-b bg-amber-50/80">
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
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
