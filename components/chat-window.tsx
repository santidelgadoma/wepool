"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { enviarMensaje, type Mensaje } from "@/lib/actions/mensajes";
import { formatearHoraCDMX } from "@/lib/datetime";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Chat en tiempo real de un viaje confirmado (ver
// docs/diseno_chat_y_calificaciones.md sección A). Mismo patrón de
// suscripción que components/feed-realtime.tsx (canal privado, `setAuth()`
// antes de suscribirse -- sin eso la política de realtime.messages de
// supabase/migrations/0010_chat.sql rechaza la suscripción en silencio), pero
// a diferencia del feed, aquí el broadcast SÍ trae el mensaje completo (el
// canal ya está scoped a los dos únicos usuarios del viaje) y este
// componente sí renderiza UI -- no es un listener silencioso.
export function ChatWindow({
  tripId,
  mensajesIniciales,
  miId,
  contraparteNombre,
}: {
  tripId: string;
  mensajesIniciales: Mensaje[];
  miId: string;
  contraparteNombre: string;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>(mensajesIniciales);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    async function suscribirse() {
      await supabase.realtime.setAuth();
      if (cancelado) return;

      canal = supabase
        .channel(`chat-${tripId}`, { config: { private: true } })
        .on("broadcast", { event: "nuevo_mensaje" }, (mensaje) => {
          const payload = mensaje.payload as {
            id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          setMensajes((actuales) => {
            // Dedup por id -- por si el canal reconecta y reenvía algo que
            // ya se tenía (broadcast no garantiza entrega exactly-once).
            if (actuales.some((m) => m.id === payload.id)) return actuales;
            return [
              ...actuales,
              {
                id: payload.id,
                senderId: payload.sender_id,
                body: payload.body,
                createdAt: payload.created_at,
              },
            ];
          });
        })
        .subscribe();
    }

    suscribirse();

    return () => {
      cancelado = true;
      if (canal) supabase.removeChannel(canal);
    };
  }, [tripId]);

  // Siempre baja al mensaje más reciente cuando llega uno nuevo (propio o de
  // la contraparte) -- comportamiento esperado de cualquier chat.
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  function handleEnviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setError(null);
    startTransition(async () => {
      let resultado: { error?: string; success?: boolean };
      try {
        resultado = await enviarMensaje(tripId, cuerpo);
      } catch (err) {
        console.error("enviarMensaje lanzó una excepción:", err);
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
        return;
      }
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      // El mensaje propio llega por el mismo broadcast (ver comentario en
      // lib/actions/mensajes.ts) -- solo se limpia el input aquí.
      setTexto("");
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listaRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto py-4">
        {mensajes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay mensajes. Escríbele a {contraparteNombre} para coordinar el viaje.
          </p>
        ) : (
          mensajes.map((mensaje) => {
            const esMio = mensaje.senderId === miId;
            return (
              <div
                key={mensaje.id}
                id={`mensaje-${mensaje.id}`}
                className={cn("flex", esMio ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    esMio
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{mensaje.body}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-right text-[10px]",
                      esMio ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    {formatearHoraCDMX(mensaje.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex-shrink-0 space-y-1 border-t pt-3">
        <div className="flex items-end gap-2">
          <Textarea
            id="mensaje-input"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEnviar();
              }
            }}
            placeholder="Escribe un mensaje..."
            rows={1}
            maxLength={1000}
            className="min-h-[36px] resize-none py-2"
          />
          <Button
            id="enviar-mensaje-submit"
            size="icon"
            onClick={handleEnviar}
            disabled={isPending || texto.trim().length === 0}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
