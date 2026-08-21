"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { unirmeAViaje } from "@/lib/actions/feed";

export function UnirmeBoton({
  driverOfferId,
  savedLocationId,
}: {
  driverOfferId: string;
  savedLocationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unido, setUnido] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let resultado: { error?: string; success?: boolean };
      try {
        resultado = await unirmeAViaje(driverOfferId, savedLocationId);
      } catch (err) {
        // Mismo patrón defensivo que ElegirBoton (components/elegir-boton.tsx):
        // sin este catch, una excepción real dentro del transition se la
        // traga React en silencio y la pantalla se queda igual.
        console.error("unirmeAViaje lanzó una excepción:", err);
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
        return;
      }
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setUnido(true);
      startTransition(() => {
        router.refresh();
      });
    });
  }

  if (unido) {
    return (
      <p className="max-w-[10rem] text-right text-xs font-medium text-emerald-700">
        ¡Te uniste! Esperando confirmación del conductor.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        id={`unirme-${driverOfferId}`}
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Uniéndote..." : "Unirme a este viaje"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
