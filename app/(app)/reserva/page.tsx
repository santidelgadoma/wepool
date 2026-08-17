import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ReservaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reservar viaje</h1>
        <p className="text-muted-foreground">
          Publica un viaje como conductor o resérvalo como pasajero, de ida o de regreso.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximamente — Fase 3</CardTitle>
          <CardDescription>
            Formulario de publicación/reservación: dirección, hora, vehículo y vías de
            cuota si eres conductor, punto de encuentro para viajes de regreso. Se guarda
            en <code>trip_offers</code> vía Server Action. Ver <code>PROGRESS.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
