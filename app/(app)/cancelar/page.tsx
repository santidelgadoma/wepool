import { Car, User, MapPin, Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CancelarBoton } from "@/components/cancelar-boton";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION, ETIQUETA_ROL } from "@/lib/etiquetas";

export default async function CancelarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ofertas } = await supabase
    .from("trip_offers")
    .select("id, direction, role, home_address, scheduled_time")
    .eq("user_id", user!.id)
    .eq("status", "buscando")
    .order("scheduled_time", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cancelar reservación</h1>
        <p className="text-muted-foreground">
          Cancela una reservación de ida o de regreso mientras no tenga un viaje confirmado.
        </p>
      </div>

      {!ofertas || ofertas.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <XCircle className="h-5 w-5" />
            </div>
            <CardTitle>No tienes reservaciones activas</CardTitle>
            <CardDescription>
              Publica o reserva un viaje desde{" "}
              <a className="underline" href="/reserva">
                Reservar
              </a>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {ofertas.map((oferta) => {
            const esConductor = oferta.role === "conductor";
            return (
              <Card key={oferta.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={esConductor ? "default" : "secondary"}>
                        {esConductor ? (
                          <Car className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {ETIQUETA_ROL[oferta.role as "conductor" | "pasajero"]}
                      </Badge>
                      <Badge variant="outline">
                        {ETIQUETA_DIRECCION[oferta.direction as "ida" | "regreso"]}
                      </Badge>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {oferta.home_address}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatearFechaHoraCDMX(oferta.scheduled_time)}
                      </span>
                    </CardDescription>
                  </div>
                  <CancelarBoton offerId={oferta.id} />
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
