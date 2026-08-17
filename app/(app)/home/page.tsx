import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Esta pantalla ya hace un viaje de ida y vuelta real con Supabase: lee el
// usuario autenticado y su fila en `profiles` (protegida por RLS). Sirve
// para confirmar que auth + base de datos + RLS están bien conectados de
// punta a punta antes de construir el resto de las pantallas.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, institutions(name)")
    .eq("id", user!.id)
    .single();

  // institutions viene como objeto o arreglo según la versión del cliente de
  // Supabase que resuelva la relación embebida — se normaliza aquí.
  const institucion = Array.isArray(profile?.institutions)
    ? profile?.institutions[0]?.name
    : (profile?.institutions as { name: string } | null)?.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {profile?.full_name ?? user?.email}</h1>
        <p className="text-muted-foreground">¿Qué viaje quieres organizar hoy?</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
          <CardDescription>
            {user?.email}
            {profile?.phone ? ` · ${profile.phone}` : ""}
            {institucion ? ` · ${institucion}` : ""}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
