import { Car, User, MapPin, Clock, Wallet, History as HistoryIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { RatingBadge } from "@/components/rating-badge";
import { CalificarForm } from "@/components/calificar-form";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION, ETIQUETA_STATUS_CONFIRMADO } from "@/lib/etiquetas";
import {
  precioDeMatchEmbebido,
  formatearMXN,
  type TripMatchEmbebido,
} from "@/lib/pricing";

const VARIANTE_STATUS: Record<"programado" | "completado" | "cancelado", BadgeProps["variant"]> = {
  programado: "info",
  completado: "success",
  cancelado: "destructive",
};

export default async function HistorialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: viajes } = await supabase
    .from("confirmed_trips")
    .select(
      "id, direction, home_address, scheduled_time, status, driver_id, passenger_id, trip_matches(estimated_duration_minutes, distance_km)"
    )
    .or(`driver_id.eq.${user!.id},passenger_id.eq.${user!.id}`)
    .order("scheduled_time", { ascending: false });

  // Calificaciones (ver supabase/migrations/0011_calificaciones.sql,
  // docs/diseno_chat_y_calificaciones.md sección B): una consulta en lote
  // para la propia calificación de cada viaje (decide si el formulario se
  // muestra en modo lectura/edición o vacío) y otra para nombre +
  // rating_avg/rating_count de cada contraparte -- misma política "select
  // matched profile" que ya usa /manana, sin necesitar el cliente admin.
  const idsViajes = (viajes ?? []).map((v) => v.id);
  const { data: misCalificaciones } =
    idsViajes.length > 0
      ? await supabase
          .from("trip_ratings")
          .select("confirmed_trip_id, stars, comment, no_show")
          .eq("rater_id", user!.id)
          .in("confirmed_trip_id", idsViajes)
      : { data: [] as { confirmed_trip_id: string; stars: number | null; comment: string | null; no_show: boolean }[] };
  const mapaCalificaciones = new Map(
    (misCalificaciones ?? []).map((r) => [r.confirmed_trip_id, r])
  );

  const idsContraparte = Array.from(
    new Set((viajes ?? []).map((v) => (v.driver_id === user!.id ? v.passenger_id : v.driver_id)))
  );
  const { data: perfilesContraparte } =
    idsContraparte.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, rating_avg, rating_count")
          .in("id", idsContraparte)
      : {
          data: [] as {
            id: string;
            full_name: string;
            rating_avg: number | null;
            rating_count: number;
          }[],
        };
  const mapaContraparte = new Map((perfilesContraparte ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Historial de viajes</h1>
        <p className="text-muted-foreground">Viajes que ya realizaste como conductor o pasajero.</p>
      </div>

      {!viajes || viajes.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <HistoryIcon className="h-5 w-5" />
            </div>
            <CardTitle>Todavía no tienes viajes confirmados</CardTitle>
            <CardDescription>
              Aparecerán aquí en cuanto confirmes un viaje desde{" "}
              <a className="underline" href="/consultar">
                Consultar viajes
              </a>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {viajes.map((viaje) => {
            const esConductor = viaje.driver_id === user!.id;
            const precio = precioDeMatchEmbebido(viaje.trip_matches as TripMatchEmbebido);
            const status = viaje.status as "programado" | "completado" | "cancelado";
            const contraparteId = esConductor ? viaje.passenger_id : viaje.driver_id;
            const contraparte = mapaContraparte.get(contraparteId);
            const contraparteNombre =
              contraparte?.full_name?.trim().split(/\s+/)[0] || "la otra persona";
            const miCalificacion = mapaCalificaciones.get(viaje.id);

            return (
              <Card key={viaje.id}>
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-1.5 text-base">
                      {esConductor ? (
                        <Car className="h-4 w-4 text-primary" />
                      ) : (
                        <User className="h-4 w-4 text-primary" />
                      )}
                      {esConductor ? "Conductor" : "Pasajero"} ·{" "}
                      {ETIQUETA_DIRECCION[viaje.direction as "ida" | "regreso"]}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={VARIANTE_STATUS[status]}>
                        {ETIQUETA_STATUS_CONFIRMADO[status]}
                      </Badge>
                      {precio && (
                        <Badge variant="success">
                          <Wallet className="h-3 w-3" />
                          {esConductor
                            ? `Ganaste ~${formatearMXN(precio.gananciaConductorMXN)}`
                            : `Pagaste ~${formatearMXN(precio.precioPasajeroMXN)}`}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {viaje.home_address}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatearFechaHoraCDMX(viaje.scheduled_time)}
                    </span>
                    {contraparte && (
                      <span className="inline-flex items-center gap-1.5">
                        Con {contraparteNombre}
                        <RatingBadge avg={contraparte.rating_avg} count={contraparte.rating_count} />
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                {status === "completado" && (
                  <CardFooter className="pt-0">
                    <CalificarForm
                      confirmedTripId={viaje.id}
                      contraparteNombre={contraparteNombre}
                      calificacionExistente={
                        miCalificacion
                          ? {
                              stars: miCalificacion.stars,
                              comment: miCalificacion.comment,
                              noShow: miCalificacion.no_show,
                            }
                          : null
                      }
                    />
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
