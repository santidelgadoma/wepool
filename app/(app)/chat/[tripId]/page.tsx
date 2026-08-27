import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerChatInicial } from "@/lib/actions/mensajes";
import { ChatWindow } from "@/components/chat-window";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";

// Chat de un viaje confirmado (ver docs/diseno_chat_y_calificaciones.md
// sección A.5). Server component: verifica sesión + pertenencia al viaje vía
// obtenerChatInicial (lib/actions/mensajes.ts) antes de renderizar nada --
// si el usuario no es driver_id/passenger_id de ese confirmed_trip (o el
// viaje no existe), lo regresa a /manana en vez de mostrar un error crudo;
// RLS (supabase/migrations/0010_chat.sql) ya lo protegería de todas formas,
// esto es solo para no enseñarle un mensaje de error técnico a alguien que
// solo cambió el id en la URL por error.
export default async function ChatPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const chat = await obtenerChatInicial(tripId);

  if (!chat.ok) {
    redirect("/manana");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b pb-3">
        <Link
          href="/manana"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Volver a Mañana</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{chat.contraparteNombre}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {ETIQUETA_DIRECCION[chat.direction]} · {formatearFechaHoraCDMX(chat.scheduledTime)}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ChatWindow
          tripId={tripId}
          mensajesIniciales={chat.mensajes}
          miId={chat.miId}
          contraparteNombre={chat.contraparteNombre}
        />
      </div>
    </div>
  );
}
