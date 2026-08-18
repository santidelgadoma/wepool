import { Car, User, Search, Clock, Wallet } from "lucide-react";
import { obtenerCandidatos } from "@/lib/actions/consultar";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ElegirBoton } from "@/components/elegir-boton";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";
import { formatearMXN } from "@/lib/pricing";

export default async function ConsultarPage() {
  const { error, candidatos } = await obtenerCandidatos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Consultar viajes disponibles</h1>
        <p className="text-muted-foreground">
          Revisa los candidatos compatibles y elige con quién compartir el viaje.
        </p>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>No se pudieron cargar los candidatos</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : candidatos.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Search className="h-5 w-5" />
            </div>
            <CardTitle>Todavía no hay candidatos compatibles</CardTitle>
            <CardDescription>
              Publica o reserva un viaje desde{" "}
              <a className="underline" href="/reserva">
                Reservar
              </a>{" "}
              y vuelve a esta pantalla — los candidatos se recalculan cada vez que la visitas. La
              duración y el precio mostrados son una estimación (velocidad promedio, no tráfico
              real ni cobro real todavía); se conectará Google Distance Matrix en Fase 4.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidatos.map((candidato) => {
            const contraparteEsConductor = candidato.contraparteRol === "conductor";
            return (
              <Card key={candidato.matchId}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={contraparteEsConductor ? "default" : "secondary"}>
                        {contraparteEsConductor ? (
                          <Car className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {contraparteEsConductor ? "Conductor" : "Pasajero"}
                      </Badge>
                      <Badge variant="outline">{ETIQUETA_DIRECCION[candidato.direction]}</Badge>
                      <Badge variant="success">
                        <Wallet className="h-3 w-3" />
                        {candidato.miRol === "conductor"
                          ? `Ganas ~${formatearMXN(candidato.gananciaConductorMXN)}`
                          : `Pagas ~${formatearMXN(candidato.precioPasajeroMXN)}`}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatearFechaHoraCDMX(candidato.scheduledTime)} · ~
                      {candidato.estimatedDurationMinutes} min de trayecto compartido (estimado)
                    </CardDescription>
                    {candidato.passengerConfirmed && (
                      <p className="text-xs text-muted-foreground">
                        {candidato.miRol === "pasajero"
                          ? "Ya elegiste este viaje — falta que el conductor lo confirme."
                          : "El pasajero ya eligió este viaje."}
                      </p>
                    )}
                  </div>
                  {candidato.puedoElegir && <ElegirBoton matchId={candidato.matchId} />}
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
