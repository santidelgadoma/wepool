import Link from "next/link";
import { Car, MapPin, Clock, Wallet, Sunrise, Search, History, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { nombreInstitucion } from "@/lib/institucion";
import { listarUbicaciones } from "@/lib/actions/ubicaciones";
import { obtenerFeed } from "@/lib/actions/feed";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocationSwitcher } from "@/components/location-switcher";
import { UbicacionForm } from "@/components/ubicacion-form";
import { UnirmeBoton } from "@/components/unirme-boton";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION, ETIQUETA_UBICACION } from "@/lib/etiquetas";
import { formatearMXN } from "@/lib/pricing";

const KINDS = ["casa", "oficina", "otro"] as const;
type Kind = (typeof KINDS)[number];

function esKindValido(valor: string | undefined): valor is Kind {
  return KINDS.includes(valor as Kind);
}

const ACCESOS_SECUNDARIOS = [
  { href: "/consultar", label: "Confirmar como conductor", icon: Search },
  { href: "/manana", label: "Viajes de mañana", icon: Sunrise },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/cancelar", label: "Cancelar", icon: XCircle },
];

// El home dejó de ser un menú de accesos rápidos y ahora ES el feed de
// viajes tipo Rappi/BlaBlaCar (ver PROGRESS.md, "Rediseño del home — feed de
// viajes"): se navega por ubicación guardada (casa/oficina/otro, set fijo —
// decisión de producto) en vez de tener que publicar una oferta propia y
// luego ir a revisar /consultar. Publicar como conductor sigue siendo un
// flujo separado (botón "Voy a manejar" -> /reserva, sin cambios) — la
// decisión de producto (brainstorm 2026-08-18) fue NO fusionar
// conductor/pasajero en cuentas separadas tipo Uber, sino mantener el rol
// flexible por viaje y separar solo la navegación en dos modos.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, ubicaciones] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, institutions(name)")
      .eq("id", user!.id)
      .single(),
    listarUbicaciones(),
  ]);

  const institucion = nombreInstitucion(profile?.institutions);
  const params = await searchParams;
  const configuradas = new Set(ubicaciones.map((u) => u.kind));
  const kindSeleccionado: Kind = esKindValido(params.loc)
    ? params.loc
    : ((ubicaciones[0]?.kind as Kind | undefined) ?? "casa");
  const ubicacionSeleccionada = ubicaciones.find((u) => u.kind === kindSeleccionado) ?? null;

  const feed = ubicacionSeleccionada
    ? await obtenerFeed(ubicacionSeleccionada.id)
    : { candidatos: [] as Awaited<ReturnType<typeof obtenerFeed>>["candidatos"] };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hola, {profile?.full_name ?? user?.email}</h1>
          <p className="text-muted-foreground">
            Viajes disponibles para mañana{institucion ? ` · ${institucion}` : ""}.
          </p>
        </div>
        <Link href="/reserva">
          <Button variant="outline">
            <Car className="mr-2 h-4 w-4" />
            Voy a manejar
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        <LocationSwitcher configuradas={configuradas} seleccionada={kindSeleccionado} />

        {!ubicacionSeleccionada ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Agrega tu dirección de {ETIQUETA_UBICACION[kindSeleccionado]}
              </CardTitle>
              <CardDescription>
                La usamos para mostrarte viajes cercanos — se guarda para que no tengas que
                volver a escribirla cada vez.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UbicacionForm kind={kindSeleccionado} />
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                Cerca de {ubicacionSeleccionada.addressText}
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground underline">
                  Cambiar dirección
                </summary>
                <div className="mt-2 max-w-sm">
                  <UbicacionForm
                    kind={kindSeleccionado}
                    direccionActual={ubicacionSeleccionada.addressText}
                  />
                </div>
              </details>
            </div>

            {feed.error ? (
              <Card>
                <CardHeader>
                  <CardTitle>No se pudo cargar el feed</CardTitle>
                  <CardDescription>{feed.error}</CardDescription>
                </CardHeader>
              </Card>
            ) : feed.candidatos.length === 0 ? (
              <Card>
                <CardHeader>
                  <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Search className="h-5 w-5" />
                  </div>
                  <CardTitle>Todavía no hay viajes publicados cerca de aquí</CardTitle>
                  <CardDescription>
                    Los conductores publican su salida la noche anterior — vuelve a checar más
                    tarde, o{" "}
                    <Link className="underline" href="/reserva">
                      publica tú un viaje como conductor
                    </Link>
                    .
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-3">
                {feed.candidatos.map((c) => (
                  <Card key={c.offerId}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>
                            <Car className="h-3 w-3" />
                            {c.driverFirstName}
                          </Badge>
                          <Badge variant="outline">{ETIQUETA_DIRECCION[c.direction]}</Badge>
                          <Badge variant="success">
                            <Wallet className="h-3 w-3" />
                            Pagarías ~{formatearMXN(c.precioPasajeroMXN)}
                          </Badge>
                        </div>
                        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatearFechaHoraCDMX(c.scheduledTime)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            ~{c.distanceKm.toFixed(1)} km
                            {c.duracionMinutos !== null && ` · ~${c.duracionMinutos} min de trayecto`}
                          </span>
                          {c.vehicleDescription && <span>{c.vehicleDescription}</span>}
                        </CardDescription>
                      </div>
                      <UnirmeBoton
                        driverOfferId={c.offerId}
                        savedLocationId={ubicacionSeleccionada.id}
                      />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {ACCESOS_SECUNDARIOS.map((acceso) => {
          const Icon = acceso.icon;
          return (
            <Link key={acceso.href} href={acceso.href}>
              <Button variant="ghost" size="sm">
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {acceso.label}
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
