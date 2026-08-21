"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { elegirCandidato } from "@/lib/actions/consultar";

export function ElegirBoton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let resultado: { error?: string; success?: boolean };
      try {
        resultado = await elegirCandidato(matchId);
      } catch (err) {
        // Si algo revienta de forma inesperada del lado del servidor (no un
        // `error` controlado, sino una excepción real), sin este catch la
        // promesa se rechaza dentro del transition y React se lo traga en
        // silencio — la pantalla se queda igual sin ninguna pista de qué
        // pasó. Lo mostramos y lo mandamos a consola para poder diagnosticar.
        console.error("elegirCandidato lanzó una excepción:", err);
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
        return;
      }
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      // A diferencia de antes, esta tarjeta va a desaparecer de la lista en
      // cuanto se recargue (la oferta propia pasa a 'pendiente', ver
      // lib/actions/consultar.ts) — el estado de espera persistente ahora
      // vive en /home, no aquí. `elegido` solo se alcanza a ver un instante
      // antes de que router.refresh() la quite de la lista.
      setElegido(true);
      // revalidatePath (dentro de elegirCandidato) invalida la caché del
      // servidor, pero no obliga al cliente a re-pedir esta ruta. Se envuelve
      // en su propio startTransition (en vez de llamarlo directo aquí,
      // después de un await) porque ese es el patrón que documenta Next.js
      // para que React lo trate como una transición nueva de forma confiable.
      startTransition(() => {
        router.refresh();
      });
    });
  }

  if (elegido) {
    return (
      <p className="max-w-[10rem] text-right text-xs font-medium text-emerald-700">
        ¡Elegido! Revisa el estado en Inicio.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button id={`elegir-${matchId}`} size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? "Eligiendo..." : "Elegir este viaje"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
