"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, Clock, Wallet, Bell } from "lucide-react";
import { Card, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { responderSolicitud, type SolicitudPendienteConductor } from "@/lib/actions/solicitudes";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";
import { formatearMXN } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Una solicitud pendiente de respuesta del conductor, con botones de
// Aceptar/Rechazar. Se usa en dos lugares con el mismo componente para no
// duplicar la lógica de aceptar/rechazar (ver PROGRESS.md, "Solicitudes
// urgentes"): el banner urgente global (app/(app)/layout.tsx, `urgente=true`
// -- se ve en TODAS las pantallas) y la sección "Solicitudes por responder"
// de /consultar (`urgente=false` -- mismo contenido, estilo normal, para
// quien prefiera revisar ahí en vez de responder desde el banner).
export function SolicitudCard({
  solicitud,
  urgente = false,
}: {
  solicitud: SolicitudPendienteConductor;
  urgente?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [respondida, setRespondida] = useState<"aceptado" | "rechazado" | null>(null);

  function responder(accion: "aceptar" | "rechazar") {
    setError(null);
    startTransition(async () => {
      let resultado: { error?: string; success?: boolean };
      try {
        resultado = await responderSolicitud(solicitud.matchId, accion);
      } catch (err) {
        // Mismo patrón defensivo que el resto de los botones de acción de la
        // app (ver components/elegir-boton.tsx, unirme-boton.tsx).
        console.error("responderSolicitud lanzó una excepción:", err);
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
        return;
      }
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setRespondida(accion === "aceptar" ? "aceptado" : "rechazado");
      startTransition(() => {
        router.refresh();
      });
    });
  }

  if (respondida) {
    return (
      <Card className={urgente ? "border-amber-300 bg-amber-50" : undefined}>
        <CardHeader className="py-4">
          <p
            className={cn(
              "text-sm font-medium",
              respondida === "aceptado" ? "text-emerald-700" : "text-muted-foreground"
            )}
          >
            {respondida === "aceptado"
              ? "¡Viaje confirmado! Ya puedes verlo en Mañana."
              : "Solicitud rechazada. Vuelve a estar disponible en el feed."}
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      className={
        urgente
          ? "border-amber-300 bg-amber-50 shadow-md ring-1 ring-amber-200"
          : undefined
      }
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {urgente && (
              <Badge variant="destructive">
                <Bell className="h-3 w-3" />
                Responde ya
              </Badge>
            )}
            <Badge variant="secondary">
              <User className="h-3 w-3" />
              {solicitud.passengerFirstName}
            </Badge>
            <Badge variant="outline">{ETIQUETA_DIRECCION[solicitud.direction]}</Badge>
            <Badge variant="success">
              <Wallet className="h-3 w-3" />
              Ganas ~{formatearMXN(solicitud.gananciaConductorMXN)}
            </Badge>
          </div>
          <CardDescription className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatearFechaHoraCDMX(solicitud.scheduledTime)} · ~{solicitud.duracionMinutos} min de
            trayecto compartido
          </CardDescription>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button
            id={`aceptar-${solicitud.matchId}`}
            size="sm"
            onClick={() => responder("aceptar")}
            disabled={isPending}
          >
            {isPending ? "..." : "Aceptar"}
          </Button>
          <Button
            id={`rechazar-${solicitud.matchId}`}
            size="sm"
            variant="outline"
            onClick={() => responder("rechazar")}
            disabled={isPending}
          >
            {isPending ? "..." : "Rechazar"}
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
