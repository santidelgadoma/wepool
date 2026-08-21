"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { guardarUbicacion, type GuardarUbicacionState } from "@/lib/actions/ubicaciones";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ETIQUETA_UBICACION } from "@/lib/etiquetas";

const ESTADO_INICIAL: GuardarUbicacionState = {};

export function UbicacionForm({
  kind,
  direccionActual,
}: {
  kind: "casa" | "oficina" | "otro";
  direccionActual?: string;
}) {
  const [state, formAction] = useActionState(guardarUbicacion, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-1.5">
        <Label htmlFor={`address-${kind}`}>Dirección de {ETIQUETA_UBICACION[kind]}</Label>
        <Input
          id={`address-${kind}`}
          name="address"
          placeholder="Calle, colonia, alcaldía o municipio, ciudad"
          defaultValue={direccionActual}
          required
        />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <BotonGuardar kind={kind} />
    </form>
  );
}

function BotonGuardar({ kind }: { kind: "casa" | "oficina" | "otro" }) {
  const { pending } = useFormStatus();
  return (
    <Button id={`guardar-ubicacion-${kind}`} type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando..." : "Guardar ubicación"}
    </Button>
  );
}
