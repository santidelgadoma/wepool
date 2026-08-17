import { obtenerCandidatos } from "@/lib/actions/consultar";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ElegirBoton } from "@/components/elegir-boton";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";

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
            <CardTitle>Todavía no hay candidatos compatibles</CardTitle>
            <CardDescription>
              Publica o reserva un viaje desde{" "}
              <a className="underline" href="/reserva">
                Reservar
              </a>{" "}
              y vuelve a esta pantalla — los candidatos se recalculan cada vez que la visitas. La
              duración mostrada es una estimación temporal (velocidad promedio, no tráfico real);
              se conectará Google Distance Matrix en Fase 4.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidatos.map((candidato) => (
            <Card key={candidato.matchId}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>
                    {candidato.contraparteRol === "conductor" ? "Conductor" : "Pasajero"} ·{" "}
                    {ETIQUETA_DIRECCION[candidato.direction]}
                  </CardTitle>
                  <CardDescription>
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
          ))}
        </div>
      )}
    </div>
  );
}
