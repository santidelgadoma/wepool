import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatearFechaHoraCDMX, rangoUTCDeManana } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";
import {
  duracionDeMatchEmbebido,
  estimarPrecioDesdeDuracionMinutos,
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
      "id, direction, home_address, scheduled_time, meeting_point, driver_id, passenger_id, trip_matches(estimated_duration_minutes)"
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
            const duracion = duracionDeMatchEmbebido(viaje.trip_matches as TripMatchEmbebido);
            const precio = duracion !== null ? estimarPrecioDesdeDuracionMinutos(duracion) : null;

            return (
              <Card key={viaje.id}>
                <CardHeader>
                  <CardTitle>
                    {esConductor ? "Conductor" : "Pasajero"} ·{" "}
                    {ETIQUETA_DIRECCION[viaje.direction as "ida" | "regreso"]}
                  </CardTitle>
                  <CardDescription>
                    {viaje.home_address} — {formatearFechaHoraCDMX(viaje.scheduled_time)}
                    {viaje.meeting_point ? ` · Punto de encuentro: ${viaje.meeting_point}` : ""}
                  </CardDescription>
                  {precio && (
                    <p className="text-sm font-medium text-emerald-700">
                      {esConductor
                        ? `Vas a ganar ~${formatearMXN(precio.gananciaConductorMXN)}`
                        : `Vas a pagar ~${formatearMXN(precio.precioPasajeroMXN)}`}
                    </p>
                  )}
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
