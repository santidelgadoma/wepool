import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function MananaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Viajes de mañana</h1>
        <p className="text-muted-foreground">
          Tu viaje de ida y de regreso confirmados para el día siguiente.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximamente — Fase 3</CardTitle>
          <CardDescription>
            Filtra <code>confirmed_trips</code> del usuario por{" "}
            <code>scheduled_time</code> = mañana, mostrando horarios, dirección y
            contacto de la contraparte. Ver <code>PROGRESS.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
