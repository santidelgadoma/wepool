import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function CancelarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cancelar reservación</h1>
        <p className="text-muted-foreground">
          Cancela una reservación de ida o de regreso mientras no tenga un viaje confirmado.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximamente — Fase 3</CardTitle>
          <CardDescription>
            Lista las reservaciones activas del usuario (<code>trip_offers</code> con{" "}
            <code>status = &apos;buscando&apos;</code>) con botón de cancelar. Ver{" "}
            <code>PROGRESS.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
