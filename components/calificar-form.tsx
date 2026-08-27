"use client";

import { useState, useTransition } from "react";
import { Star, Ban, Pencil } from "lucide-react";
import { calificarViaje } from "@/lib/actions/calificaciones";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type CalificacionExistente = {
  stars: number | null;
  comment: string | null;
  noShow: boolean;
};

// Formulario de calificación de un viaje ya completado (ver
// docs/diseno_chat_y_calificaciones.md sección B). Vive en /historial, uno
// por cada viaje `completado` -- si el usuario actual ya lo calificó se
// muestra en modo lectura con un botón "Editar" (calificación editable a
// propósito, decisión confirmada); si no, el formulario. "No se realizó"
// cuenta como calificación para efectos del bloqueo de
// lib/actions/calificaciones.ts (desbloquea /reserva) pero NO inserta
// estrellas ni afecta el promedio de nadie -- existe para que alguien no
// quede atrapado calificando un viaje que nunca ocurrió, ahora que la
// calificación es obligatoria (bloqueo real).
export function CalificarForm({
  confirmedTripId,
  contraparteNombre,
  calificacionExistente,
}: {
  confirmedTripId: string;
  contraparteNombre: string;
  calificacionExistente: CalificacionExistente | null;
}) {
  const [editando, setEditando] = useState(!calificacionExistente);
  const [stars, setStars] = useState(calificacionExistente?.stars ?? 0);
  const [noShow, setNoShow] = useState(calificacionExistente?.noShow ?? false);
  const [comment, setComment] = useState(calificacionExistente?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!noShow && stars === 0) {
      setError("Elige de 1 a 5 estrellas, o marca que el viaje no se realizó.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const resultado = await calificarViaje({
        confirmedTripId,
        noShow,
        stars: noShow ? undefined : stars,
        comment: comment.trim() || undefined,
      });
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
    });
  }

  if (!editando && calificacionExistente) {
    return (
      <div className="flex w-full items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        {calificacionExistente.noShow ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Ban className="h-3.5 w-3.5" />
            Marcaste que este viaje no se realizó.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-4 w-4",
                  i < (calificacionExistente.stars ?? 0)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground"
                )}
              />
            ))}
          </span>
        )}
        <Button
          id={`calificar-editar-${confirmedTripId}`}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditando(true)}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Editar
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Califica a {contraparteNombre}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div id={`calificar-estrellas-${confirmedTripId}`} className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) => {
            const n = i + 1;
            return (
              <button
                key={n}
                type="button"
                id={`estrella-${n}-${confirmedTripId}`}
                onClick={() => {
                  setStars(n);
                  setNoShow(false);
                }}
                aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
                className="p-0.5"
              >
                <Star
                  className={cn(
                    "h-6 w-6 transition-colors",
                    !noShow && n <= stars
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground"
                  )}
                />
              </button>
            );
          })}
        </div>
        <Button
          id={`no-realizado-${confirmedTripId}`}
          type="button"
          variant={noShow ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setNoShow((actual) => !actual);
            setStars(0);
          }}
        >
          <Ban className="mr-1 h-3.5 w-3.5" />
          No se realizó
        </Button>
      </div>
      <Textarea
        id={`calificar-comentario-${confirmedTripId}`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentario opcional (visible para cualquier usuario de WEPOOL)"
        maxLength={500}
        rows={2}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        id={`calificar-enviar-${confirmedTripId}`}
        type="button"
        size="sm"
        onClick={handleSubmit}
        disabled={isPending}
      >
        {calificacionExistente ? "Guardar cambios" : "Enviar calificación"}
      </Button>
    </div>
  );
}
