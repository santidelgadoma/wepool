"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { elegirCandidato } from "@/lib/actions/consultar";

export function ElegirBoton({ matchId }: { matchId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const resultado = await elegirCandidato(matchId);
      if (resultado.error) setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? "Eligiendo..." : "Elegir este viaje"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
