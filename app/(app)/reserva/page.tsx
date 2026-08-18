import { createClient } from "@/lib/supabase/server";
import { ReservaForm } from "@/components/reserva-form";

export default async function ReservaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
