"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardDescription } from "@/components/ui/card";

// Aviso de "¡Viaje publicado!" tras el redirect de /reserva a
// /home?publicado=1 (ver lib/actions/reserva.ts, crearOferta). Se limpia
// solo del URL después de unos segundos con router.replace("/home") -- así
// si el usuario refresca /home más tarde el aviso ya no reaparece (a
// diferencia de dejarlo colgado del query string para siempre). No borra
// nada de la base de datos porque no hay nada que borrar -- a diferencia del
// aviso de rechazo (obtenerEstadoPasajero), este no depende de una fila en
// trip_offers, solo del query param.
export function PublicadoBanner() {
  const router = useRouter();

  useEffect(() => {
    const temporizador = setTimeout(() => {
      router.replace("/home");
    }, 4000);
    return () => clearTimeout(temporizador);
  }, [router]);

  return (
    <Card id="publicado-banner" className="border-emerald-300 bg-emerald-50">
      <CardHeader className="flex flex-row items-center gap-3 py-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
        <CardDescription className="text-sm text-foreground">
          ¡Viaje publicado! Te avisaremos aquí en cuanto alguien lo elija.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
