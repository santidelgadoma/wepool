import { Car, User, MapPin, Clock, Wallet, History as HistoryIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION, ETIQUETA_STATUS_CONFIRMADO } from "@/lib/etiquetas";
import {
  duracionDeMatchEmbebido,
  estimarPrecioDesdeDuracionMinutos,
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
      "id, direction, home_address, scheduled_time, status, driver_id, passenger_id, trip_matches(estimated_duration_minutes)"
    )
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
            const duracion = duracionDeMatchEmbebido(viaje.trip_matches as TripMatchEmbebido);
            const precio = duracion !== null ? estimarPrecioDesdeDuracionMinutos(duracion) : null;
            const status = viaje.status as "programado" | "completado" | "cancelado";

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
