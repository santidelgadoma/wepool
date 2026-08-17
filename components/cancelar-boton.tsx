"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelarOferta } from "@/lib/actions/cancelar";

export function CancelarBoton({ offerId }: { offerId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const resultado = await cancelarOferta(offerId);
      if (resultado.error) setError(resultado.error);
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
