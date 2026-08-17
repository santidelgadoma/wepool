import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION, ETIQUETA_STATUS_CONFIRMADO } from "@/lib/etiquetas";

export default async function HistorialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: viajes } = await supabase
    .from("confirmed_trips")
    .select("id, direction, home_address, scheduled_time, status, driver_id, passenger_id")
    .or(`driver_id.eq.${user!.id},passenger_id.eq.${user!.id}`)
    .order("scheduled_time", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Historial de viajes</h1>
        <p className="text-muted-foreground">Viajes que ya realizaste como conductor o pasajero.</p>
      </div>

      {!viajes || viajes.length === 0 ? (
        <Card>
          <CardHeader>
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
          {viajes.map((viaje) => (
            <Card key={viaje.id}>
              <CardHeader>
                <CardTitle>
                  {viaje.driver_id === user!.id ? "Conductor" : "Pasajero"} ·{" "}
                  {ETIQUETA_DIRECCION[viaje.direction as "ida" | "regreso"]} ·{" "}
                  {ETIQUETA_STATUS_CONFIRMADO[
                    viaje.status as "programado" | "completado" | "cancelado"
                  ]}
                </CardTitle>
                <CardDescription>
                  {viaje.home_address} — {formatearFechaHoraCDMX(viaje.scheduled_time)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
