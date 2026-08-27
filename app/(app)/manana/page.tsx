import Link from "next/link";
import { Car, User, MapPin, Clock, Flag, Wallet, Sunrise, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RatingBadge } from "@/components/rating-badge";
import { formatearFechaHoraCDMX, rangoUTCDeManana } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";
import {
  precioDeMatchEmbebido,
  formatearMXN,
  type TripMatchEmbebido,
} from "@/lib/pricing";

export default async function MananaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { inicio, fin } = rangoUTCDeManana();

  const { data: viajes } = await supabase
    .from("confirmed_trips")
    .select(
      "id, direction, home_address, scheduled_time, meeting_point, driver_id, passenger_id, trip_matches(estimated_duration_minutes, distance_km)"
    )
    .or(`driver_id.eq.${user!.id},passenger_id.eq.${user!.id}`)
    .gte("scheduled_time", inicio)
    .lt("scheduled_time", fin)
    .order("scheduled_time", { ascending: true });

  // Badge de calificación de la contraparte (ver
  // supabase/migrations/0011_calificaciones.sql, componentes/rating-badge.tsx)
  // -- una sola consulta extra, en lote, para todos los viajes de la lista;
  // la política "select matched profile" (0001_init_schema.sql) ya permite
  // leer rating_avg/rating_count de estos perfiles porque todos son
  // contrapartes de un confirmed_trip con el usuario actual.
  const idsContraparte = Array.from(
    new Set(
      (viajes ?? []).map((v) => (v.driver_id === user!.id ? v.passenger_id : v.driver_id))
    )
  );
  const { data: perfilesContraparte } =
    idsContraparte.length > 0
      ? await supabase.from("profiles").select("id, rating_avg, rating_count").in("id", idsContraparte)
      : { data: [] as { id: string; rating_avg: number | null; rating_count: number }[] };
  const mapaRating = new Map((perfilesContraparte ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Viajes de mañana</h1>
        <p className="text-muted-foreground">
          Tu viaje de ida y de regreso confirmados para el día siguiente.
        </p>
      </div>

      {!viajes || viajes.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Sunrise className="h-5 w-5" />
            </div>
            <CardTitle>Todavía no tienes viajes confirmados para mañana</CardTitle>
            <CardDescription>
              Publica o reserva un viaje desde{" "}
              <a className="underline" href="/reserva">
                Reservar
              </a>
              , y confírmalo desde{" "}
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
            const contraparteId = esConductor ? viaje.passenger_id : viaje.driver_id;
            const rating = mapaRating.get(contraparteId);

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
                      {rating && <RatingBadge avg={rating.rating_avg} count={rating.rating_count} />}
                    </CardTitle>
                    {precio && (
                      <Badge variant="success">
                        <Wallet className="h-3 w-3" />
                        {esConductor
                          ? `Ganas ~${formatearMXN(precio.gananciaConductorMXN)}`
                          : `Pagas ~${formatearMXN(precio.precioPasajeroMXN)}`}
                      </Badge>
                    )}
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
                    {viaje.meeting_point && (
                      <span className="inline-flex items-center gap-1">
                        <Flag className="h-3.5 w-3.5" />
                        {viaje.meeting_point}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Link href={`/chat/${viaje.id}`}>
                    <Button id={`chat-link-${viaje.id}`} variant="outline" size="sm">
                      <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                      Chat
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
