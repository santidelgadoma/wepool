import Link from "next/link";
import { PlusCircle, Search, Sunrise, History, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { nombreInstitucion } from "@/lib/institucion";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const ACCESOS_RAPIDOS = [
  {
    href: "/reserva",
    label: "Reservar viaje",
    description: "Publica como conductor o resérvate como pasajero, de ida o de regreso.",
    icon: PlusCircle,
  },
  {
    href: "/consultar",
    label: "Consultar viajes",
    description: "Revisa candidatos compatibles y confirma con quién compartes el viaje.",
    icon: Search,
  },
  {
    href: "/manana",
    label: "Viajes de mañana",
    description: "Lo que ya tienes confirmado para el día siguiente.",
    icon: Sunrise,
  },
  {
    href: "/historial",
    label: "Historial",
    description: "Los viajes que ya hiciste como conductor o pasajero.",
    icon: History,
  },
  {
    href: "/cancelar",
    label: "Cancelar",
    description: "Da de baja una reservación mientras no tenga viaje confirmado.",
    icon: XCircle,
  },
];

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
  // Supabase que resuelva la relación embebida — se normaliza en lib/institucion.ts
  // (antes era un cast en línea que compilaba mal con `next build`, ver PROGRESS.md).
  const institucion = nombreInstitucion(profile?.institutions);

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

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Accesos rápidos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACCESOS_RAPIDOS.map((acceso) => {
            const Icon = acceso.icon;
            return (
              <Link key={acceso.href} href={acceso.href} className="block">
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/50">
                  <CardHeader>
                    <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">{acceso.label}</CardTitle>
                    <CardDescription>{acceso.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
