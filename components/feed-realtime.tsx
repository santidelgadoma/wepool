"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Direccion = "ida" | "regreso";

// Feed en tiempo real (ver PROGRESS.md, "Feed en tiempo real con Realtime
// Broadcast"): mientras el pasajero navega el home sin tener todavía una
// solicitud pendiente/confirmada para AMBAS direcciones, este componente se
// suscribe al canal privado de su institución (ver
// supabase/migrations/0009_feed_tiempo_real.sql) y refresca la pantalla en
// cuanto un conductor publica -- o vuelve a estar disponible tras un
// rechazo/cancelación -- un viaje, sin que el pasajero tenga que recargar a
// mano. No renderiza nada -- es puramente un listener en segundo plano.
export function FeedRealtime({
  institutionId,
  direccionesBloqueadas,
}: {
  institutionId: string;
  direccionesBloqueadas: readonly Direccion[];
}) {
  const router = useRouter();
  const bloqueadasRef = useRef(direccionesBloqueadas);
  bloqueadasRef.current = direccionesBloqueadas;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    async function suscribirse() {
      // Los canales privados necesitan el JWT vigente antes de suscribirse
      // (ver documentación de Supabase Realtime Authorization) -- sin esto,
      // la política de realtime.messages (0009_feed_tiempo_real.sql) rechaza
      // la suscripción en silencio.
      await supabase.realtime.setAuth();
      if (cancelado) return;

      canal = supabase
        .channel(`feed-${institutionId}`, { config: { private: true } })
        .on("broadcast", { event: "nueva_oferta" }, (mensaje) => {
          const direction = (mensaje.payload as { direction?: Direccion } | undefined)
            ?.direction;
          // Si el aviso es de una dirección que este pasajero ya tiene
          // bloqueada (solicitud pendiente o viaje confirmado), no hay nada
          // nuevo que mostrarle -- evita refrescos innecesarios.
          if (direction && bloqueadasRef.current.includes(direction)) return;

          // Debounce corto: si se publican varios viajes seguidos (p.ej. al
          // correr un script de seed en vivo durante una demo), refresca la
          // pantalla una sola vez en vez de una vez por cada aviso.
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            router.refresh();
          }, 600);
        })
        .subscribe();
    }

    suscribirse();

    return () => {
      cancelado = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (canal) supabase.removeChannel(canal);
    };
    // Solo se resuscribe si cambia la institución (no debería pasar en la
    // práctica) -- direccionesBloqueadas se lee de bloqueadasRef.current en
    // vez de estar en las dependencias para no des/re-suscribirse cada vez
    // que el pasajero elige o le rechazan un viaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  return null;
}
