import { Car, User, MapPin, Clock, Flag, Wallet, Sunrise } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
