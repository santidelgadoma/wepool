import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatearFechaHoraCDMX, rangoUTCDeManana } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";

export default async function MananaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { inicio, fin } = rangoUTCDeManana();

  const { data: viajes } = await supabase
    .from("confirmed_trips")
    .select(
      "id, direction, home_address, scheduled_time, meeting_point, driver_id, passenger_id"
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
          {viajes.map((viaje) => (
            <Card key={viaje.id}>
              <CardHeader>
                <CardTitle>
                  {viaje.driver_id === user!.id ? "Conductor" : "Pasajero"} ·{" "}
                  {ETIQUETA_DIRECCION[viaje.direction as "ida" | "regreso"]}
                </CardTitle>
                <CardDescription>
                  {viaje.home_address} — {formatearFechaHoraCDMX(viaje.scheduled_time)}
                  {viaje.meeting_point ? ` · Punto de encuentro: ${viaje.meeting_point}` : ""}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
