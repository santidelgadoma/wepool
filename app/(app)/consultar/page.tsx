import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ConsultarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Consultar viajes disponibles</h1>
        <p className="text-muted-foreground">
          Revisa los candidatos compatibles y elige con quién compartir el viaje.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximamente — Fase 3</CardTitle>
          <CardDescription>
            Muestra los candidatos calculados en <code>trip_matches</code> (a partir de{" "}
            <code>find_candidate_offers</code> + Google Distance Matrix) con hora estimada
            y duración. Ver <code>PROGRESS.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
