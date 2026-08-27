import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ReservaForm } from "@/components/reserva-form";
import { obtenerViajesPorCalificar } from "@/lib/actions/calificaciones";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";
import { formatearFechaHoraCDMX } from "@/lib/datetime";

export default async function ReservaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Calificación obligatoria (ver lib/actions/calificaciones.ts, decisión
  // confirmada con el usuario): mientras haya un viaje completado sin
  // calificar, esta pantalla muestra la tarjeta de bloqueo en vez del
  // formulario -- crearOferta también lo rechazaría (defensa en
  // profundidad), pero bloquear aquí evita que alguien llene todo el
  // formulario solo para enterarse hasta el final.
  const viajesPorCalificar = await obtenerViajesPorCalificar();
  if (viajesPorCalificar.length > 0) {
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
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Star className="h-5 w-5" />
            </div>
            <CardTitle>
              Tienes {viajesPorCalificar.length} viaje
              {viajesPorCalificar.length === 1 ? "" : "s"} por calificar
            </CardTitle>
            <CardDescription>
              Antes de reservar un viaje nuevo, califica los que ya completaste (o marca los que
              no se realizaron) — así mantenemos la confianza dentro de la comunidad.
            </CardDescription>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {viajesPorCalificar.map((v) => (
                <li key={v.confirmedTripId}>
                  Con {v.contraparteNombre} · {ETIQUETA_DIRECCION[v.direction]} ·{" "}
                  {formatearFechaHoraCDMX(v.scheduledTime)}
                </li>
              ))}
            </ul>
          </CardHeader>
          <CardFooter>
            <Link href="/historial">
              <Button id="ir-a-calificar">Ir a calificar</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const [{ data: vehiculos }, { data: profile }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, plate, description")
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("institution_id").eq("id", user!.id).single(),
  ]);

  // Coordenadas del campus de la institución del usuario, si las tiene
  // cargadas (ver migración 0005_campus_institucion.sql) — se usan solo para
  // el estimado de precio/ganancia en vivo del formulario (ReservaForm /
  // previsualizarDireccion). Consulta aparte a `institutions` en vez de un
  // select con relación embebida (`profiles.select("institutions(...)")`)
  // a propósito: ese patrón ya causó un error real de compilación en
  // app/(app)/layout.tsx y app/(app)/home/page.tsx (ver PROGRESS.md) — dos
  // selects simples son más verbosos pero no tienen ese riesgo de tipos.
  let campus: { lat: number; lng: number } | null = null;
  if (profile?.institution_id) {
    const { data: institucion } = await supabase
      .from("institutions")
      .select("campus_lat, campus_lng")
      .eq("id", profile.institution_id)
      .single();
    if (institucion?.campus_lat != null && institucion?.campus_lng != null) {
      campus = { lat: institucion.campus_lat, lng: institucion.campus_lng };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reservar viaje</h1>
        <p className="text-muted-foreground">
          Publica un viaje como conductor o resérvalo como pasajero, de ida o de regreso.
        </p>
      </div>
      <ReservaForm vehiculos={vehiculos ?? []} campus={campus} />
    </div>
  );
}
