import Link from "next/link";
import {
  Car,
  MapPin,
  Clock,
  Wallet,
  Sunrise,
  Search,
  History,
  XCircle,
  Hourglass,
  CheckCircle2,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { nombreInstitucion } from "@/lib/institucion";
import { listarUbicaciones } from "@/lib/actions/ubicaciones";
import { obtenerFeed } from "@/lib/actions/feed";
import { obtenerEstadoPasajero, type EstadoDireccion } from "@/lib/actions/solicitudes";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocationSwitcher } from "@/components/location-switcher";
import { UbicacionForm } from "@/components/ubicacion-form";
import { UnirmeBoton } from "@/components/unirme-boton";
import { FeedRealtime } from "@/components/feed-realtime";
import { PublicadoBanner } from "@/components/publicado-banner";
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
  searchParams: Promise<{ loc?: string; publicado?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, ubicaciones] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, institution_id, institutions(name)")
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

  const [feed, estadoPasajero] = await Promise.all([
    ubicacionSeleccionada
      ? obtenerFeed(ubicacionSeleccionada.id)
      : Promise.resolve({
          candidatos: [] as Awaited<ReturnType<typeof obtenerFeed>>["candidatos"],
        }),
    obtenerEstadoPasajero(),
  ]);

  // Bloqueo por dirección (ver PROGRESS.md, "Solicitudes urgentes"): mientras
  // el usuario tenga una solicitud pendiente o un viaje ya confirmado de
  // ida, no puede elegir OTRO viaje de ida (pero sí de regreso, y viceversa
  // -- son independientes). Las tarjetas de la dirección bloqueada se
  // esconden del feed; en su lugar se muestra una tarjeta de estado.
  const candidatosVisibles = feed.candidatos.filter(
    (c) => estadoPasajero.estados[c.direction] === "ninguna"
  );
  const direccionesBloqueadas = (["ida", "regreso"] as const).filter(
    (d) => estadoPasajero.estados[d] !== "ninguna"
  );

  // Feed en tiempo real (ver PROGRESS.md, "Feed en tiempo real con Realtime
  // Broadcast"): solo se suscribe cuando de verdad hay algo que escuchar --
  // el pasajero necesita una ubicación guardada para tener un feed que
  // refrescar, y al menos una dirección sin bloquear (si ya tiene ida y
  // regreso resueltos, no hay ningún viaje nuevo que le sirva).
  const escuchaEnVivo =
    ubicacionSeleccionada && profile?.institution_id && direccionesBloqueadas.length < 2;

  return (
    <div className="space-y-6">
      {escuchaEnVivo && (
        <FeedRealtime
          institutionId={profile!.institution_id as string}
          direccionesBloqueadas={direccionesBloqueadas}
        />
      )}
      {/* Aviso de "¡Viaje publicado!" tras publicar como conductor (ver
          lib/actions/reserva.ts, crearOferta) -- ahora redirige aquí en vez
          de quedarse en /reserva mostrando el mensaje ahí. */}
      {params.publicado === "1" && <PublicadoBanner />}
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

      {/* Aviso de rechazo (ver PROGRESS.md, "Solicitudes urgentes"): se
          muestra una sola vez -- obtenerEstadoPasajero ya borró la oferta
          'rechazado' que lo generó en cuanto la leyó, así que no reaparece
          en la siguiente visita. */}
      {estadoPasajero.avisosRechazo.map((direction) => (
        <Card key={direction} className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-3 py-4">
            <Info className="h-5 w-5 shrink-0 text-destructive" />
            <CardDescription className="text-sm text-foreground">
              El conductor rechazó tu solicitud de{" "}
              <strong>{ETIQUETA_DIRECCION[direction].toLowerCase()}</strong>. Puedes elegir otro
              viaje de la lista de abajo.
            </CardDescription>
          </CardHeader>
        </Card>
      ))}

      {/* Tarjeta de estado por cada dirección bloqueada (ver PROGRESS.md,
          "Solicitudes urgentes") -- fuera del bloque de ubicación guardada a
          propósito: una solicitud pudo haberse originado desde /consultar
          (flujo manual viejo, sin ubicación guardada), no solo desde este
          feed, así que el aviso debe verse sin importar si ya se configuró
          una ubicación. Reemplaza las tarjetas del feed de esa dirección
          mientras el usuario tiene una solicitud pendiente o un viaje ya
          confirmado. */}
      {direccionesBloqueadas.map((direction) => {
        const estado: EstadoDireccion = estadoPasajero.estados[direction];
        const esConfirmado = estado === "confirmado";
        return (
          <Card
            key={direction}
            className={esConfirmado ? "border-emerald-300 bg-emerald-50" : "border-sky-300 bg-sky-50"}
          >
            <CardHeader className="flex flex-row items-center gap-3 py-4">
              {esConfirmado ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
              ) : (
                <Hourglass className="h-5 w-5 shrink-0 text-sky-700" />
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {esConfirmado
                    ? `Ya tienes un viaje de ${ETIQUETA_DIRECCION[direction].toLowerCase()} confirmado`
                    : `Elegiste un viaje de ${ETIQUETA_DIRECCION[direction].toLowerCase()} — esperando respuesta del conductor`}
                </p>
                <CardDescription>
                  {esConfirmado ? (
                    <>
                      Ya no puedes elegir otro viaje de {ETIQUETA_DIRECCION[direction].toLowerCase()}.
                      Revisa el detalle en{" "}
                      <Link className="underline" href="/manana">
                        Viajes de mañana
                      </Link>
                      .
                    </>
                  ) : (
                    "No puedes elegir otro viaje de esta dirección mientras esperas — si el conductor rechaza, se te avisa aquí y puedes elegir otro."
                  )}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        );
      })}

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
            ) : candidatosVisibles.length === 0 && direccionesBloqueadas.length < 2 ? (
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
            ) : candidatosVisibles.length === 0 ? null : (
              <div className="space-y-3">
                {candidatosVisibles.map((c) => (
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
