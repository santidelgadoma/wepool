import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function HistorialPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Historial de viajes</h1>
        <p className="text-muted-foreground">Viajes que ya realizaste como conductor o pasajero.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximamente — Fase 3</CardTitle>
          <CardDescription>
            Lista de <code>confirmed_trips</code> del usuario, ordenada por fecha. Ver{" "}
            <code>PROGRESS.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
