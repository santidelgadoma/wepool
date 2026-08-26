import Link from "next/link";
import { Car, MapPin, Search, Hourglass, CheckCircle2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { nombreInstitucion } from "@/lib/institucion";
import { listarUbicaciones } from "@/lib/actions/ubicaciones";
import { obtenerFeed } from "@/lib/actions/feed";
import { obtenerEstadoPasajero, type EstadoDireccion } from "@/lib/actions/solicitudes";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LocationSwitcher } from "@/components/location-switcher";
import { UbicacionForm } from "@/components/ubicacion-form";
import { FeedRealtime } from "@/components/feed-realtime";
import { FeedList } from "@/components/feed-list";
import { PublicadoBanner } from "@/components/publicado-banner";
import { ETIQUETA_DIRECCION, ETIQUETA_UBICACION } from "@/lib/etiquetas";

const KINDS = ["casa", "oficina", "otro"] as const;
type Kind = (typeof KINDS)[number];

function esKindValido(valor: string | undefined): valor is Kind {
  return KINDS.includes(valor as Kind);
}

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

  // Las dos ramas del ternario deben resolver EXACTAMENTE al mismo tipo
  // (Awaited<ReturnType<typeof obtenerFeed>>, con `error` opcional) -- si no,
  // TypeScript infiere la unión de ambas formas de objeto y `feed.error` dos
  // líneas más abajo deja de existir en la rama que no lo declara, lo cual
  // pasa inadvertido en `next dev` pero rompe `next build` (así se detectó:
  // error de compilación al desplegar).
  const [feed, estadoPasajero] = await Promise.all([
    ubicacionSeleccionada
      ? obtenerFeed(ubicacionSeleccionada.id)
      : Promise.resolve<Awaited<ReturnType<typeof obtenerFeed>>>({
          candidatos: [],
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

  // Estructura en dos franjas (ver PROGRESS.md, pedido del 2026-08-26
  // "scroll fijo con mínimo de tres viajes visibles" -- mockup aprobado en
  // Claude Design): todo lo de arriba (saludo, avisos, ubicación) es
  // `flex-shrink-0` y se queda fijo; solo la lista de tarjetas del feed
  // (dentro de FeedList) scrollea en su propio contenedor. Antes toda la
  // pantalla era una sola columna con `space-y-6` que scrolleaba entera
  // dentro de <main> -- eso es justo lo que hacía que hubiera que bajar toda
  // la lista de viajes para llegar a la fila de accesos rápidos del fondo
  // (que además ya no existe: sus 4 destinos ahora viven en la barra de
  // navegación inferior, ver components/app-nav.tsx).
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 space-y-4 pb-4">
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
            <h1 className="text-xl font-semibold sm:text-2xl">
              Hola, {profile?.full_name ?? user?.email}
            </h1>
            <p className="text-sm text-muted-foreground">
              Viajes disponibles para mañana{institucion ? ` · ${institucion}` : ""}.
            </p>
          </div>
          <Link href="/reserva">
            <Button variant="outline" size="sm">
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

        <div className="space-y-2">
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
          )}

          {ubicacionSeleccionada &&
            (feed.error ? (
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
            ) : null)}
        </div>
      </div>

      {/* Única franja con scroll propio de la pantalla -- el resto de arriba
          (saludo, avisos, ubicación) se queda fijo. Solo se monta cuando de
          verdad hay algo que listar; los estados vacíos/error ya se
          mostraron arriba, fuera de esta franja. */}
      {ubicacionSeleccionada && !feed.error && candidatosVisibles.length > 0 && (
        <div className="min-h-0 flex-1">
          <FeedList candidatos={candidatosVisibles} savedLocationId={ubicacionSeleccionada.id} />
        </div>
      )}
    </div>
  );
}
