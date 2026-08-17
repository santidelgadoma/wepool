"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelarOferta } from "@/lib/actions/cancelar";

export function CancelarBoton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let resultado: { error?: string; success?: boolean };
      try {
        resultado = await cancelarOferta(offerId);
      } catch (err) {
        console.error("cancelarOferta lanzó una excepción:", err);
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
        return;
      }
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      // Mismo patrón que elegir-boton.tsx: revalidatePath no refresca el
      // árbol de React cuando la action se llama fuera de un <form action>.
      // Se envuelve en su propio startTransition para que React lo trate
      // como una transición nueva de forma confiable.
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? "Cancelando..." : "Cancelar"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
