import { createClient } from "@/lib/supabase/server";
import { ReservaForm } from "@/components/reserva-form";

export default async function ReservaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: vehiculos } = await supabase
    .from("vehicles")
    .select("id, plate, description")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reservar viaje</h1>
        <p className="text-muted-foreground">
          Publica un viaje como conductor o resérvalo como pasajero, de ida o de regreso.
        </p>
      </div>
      <ReservaForm vehiculos={vehiculos ?? []} />
    </div>
  );
}
