import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
          {ofertas.map((oferta) => (
            <Card key={oferta.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>
                    {ETIQUETA_ROL[oferta.role as "conductor" | "pasajero"]} ·{" "}
                    {ETIQUETA_DIRECCION[oferta.direction as "ida" | "regreso"]}
                  </CardTitle>
                  <CardDescription>
                    {oferta.home_address} — {formatearFechaHoraCDMX(oferta.scheduled_time)}
                  </CardDescription>
                </div>
                <CancelarBoton offerId={oferta.id} />
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
