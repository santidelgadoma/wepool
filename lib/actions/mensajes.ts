"use server";

// Chat conductor/pasajero por viaje confirmado (ver PROGRESS.md, diseñado en
// docs/diseno_chat_y_calificaciones.md sección A antes de implementar).
// Cuelga de confirmed_trips -- ya identifica exactamente a los dos usuarios
// involucrados, así que a diferencia de trip_offers no hace falta ningún
// truco con el cliente admin: todo se lee/escribe con el cliente normal, la
// política RLS de trip_messages (supabase/migrations/0010_chat.sql) ya hace
// cumplir "solo conductor y pasajero de ese viaje". Las validaciones de
// abajo (¿el usuario es parte del viaje?) son defensa en profundidad, mismo
// patrón que responderSolicitud en lib/actions/solicitudes.ts -- si algún
// día cambia la política de RLS por error, el Server Action sigue negando el
// acceso.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type Mensaje = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type ChatInicial =
  | {
      ok: true;
      mensajes: Mensaje[];
      miId: string;
      contraparteNombre: string;
      direction: "ida" | "regreso";
      scheduledTime: string;
    }
  | { ok: false; error: string };

/**
 * Historial de mensajes de un viaje confirmado + quién es la contraparte
 * (para el encabezado del chat). Valida que el usuario actual sea driver_id
 * o passenger_id de ese confirmed_trip -- si no, ni siquiera se intenta leer
 * trip_messages (RLS lo rechazaría de todas formas, pero así se puede
 * regresar un mensaje de error claro en vez de una lista vacía ambigua).
 */
export async function obtenerChatInicial(confirmedTripId: string): Promise<ChatInicial> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const { data: viaje, error: errorViaje } = await supabase
    .from("confirmed_trips")
    .select("id, driver_id, passenger_id, direction, scheduled_time")
    .eq("id", confirmedTripId)
    .single();

  if (errorViaje || !viaje) {
    return { ok: false, error: "Ese viaje no existe o no tienes acceso a él." };
  }
  if (viaje.driver_id !== user.id && viaje.passenger_id !== user.id) {
    return { ok: false, error: "No tienes acceso al chat de ese viaje." };
  }

  const contraparteId = viaje.driver_id === user.id ? viaje.passenger_id : viaje.driver_id;
  const [{ data: mensajes, error: errorMensajes }, { data: contraparte }] = await Promise.all([
    supabase
      .from("trip_messages")
      .select("id, sender_id, body, created_at")
      .eq("confirmed_trip_id", confirmedTripId)
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("full_name").eq("id", contraparteId).single(),
  ]);

  if (errorMensajes) {
    return { ok: false, error: `No se pudo cargar el chat: ${errorMensajes.message}` };
  }

  return {
    ok: true,
    mensajes: (mensajes ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
    })),
    miId: user.id,
    contraparteNombre: contraparte?.full_name?.trim().split(/\s+/)[0] || "la otra persona",
    direction: viaje.direction as "ida" | "regreso",
    scheduledTime: viaje.scheduled_time,
  };
}

const mensajeSchema = z
  .string()
  .trim()
  .min(1, "Escribe un mensaje.")
  .max(1000, "El mensaje es demasiado largo (máximo 1000 caracteres).");

export type EnviarMensajeState = { error?: string; success?: boolean };

/**
 * Inserta un mensaje nuevo. No hace falta revalidatePath -- la entrega es
 * por Realtime Broadcast (ver el trigger notificar_mensaje_nuevo en
 * 0010_chat.sql y la suscripción en components/chat-window.tsx), no por
 * refetch de página, mismo razonamiento que ya se documentó para
 * FeedRealtime (components/feed-realtime.tsx). Sin inserción optimista a
 * propósito: el remitente está suscrito al mismo canal que la contraparte
 * (la política RLS de realtime.messages en 0010_chat.sql autoriza a ambos),
 * así que su propio mensaje le llega por el mismo broadcast -- evita tener
 * que reconciliar un id temporal local contra el id real que asigna
 * Postgres.
 */
export async function enviarMensaje(
  confirmedTripId: string,
  body: string
): Promise<EnviarMensajeState> {
  try {
    return await enviarMensajeInterno(confirmedTripId, body);
  } catch (err) {
    console.error("enviarMensaje: excepción no controlada", err);
    return { error: "Ocurrió un error inesperado al mandar el mensaje." };
  }
}

async function enviarMensajeInterno(
  confirmedTripId: string,
  bodyCrudo: string
): Promise<EnviarMensajeState> {
  const parseo = mensajeSchema.safeParse(bodyCrudo);
  if (!parseo.success) {
    return { error: parseo.error.issues[0]?.message ?? "Mensaje inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const { data: viaje, error: errorViaje } = await supabase
    .from("confirmed_trips")
    .select("id, driver_id, passenger_id")
    .eq("id", confirmedTripId)
    .single();

  if (errorViaje || !viaje) {
    return { error: "Ese viaje no existe o no tienes acceso a él." };
  }
  if (viaje.driver_id !== user.id && viaje.passenger_id !== user.id) {
    return { error: "No tienes acceso al chat de ese viaje." };
  }

  const { error: errorInsert } = await supabase.from("trip_messages").insert({
    confirmed_trip_id: confirmedTripId,
    sender_id: user.id,
    body: parseo.data,
  });

  if (errorInsert) {
    return { error: `No se pudo mandar el mensaje: ${errorInsert.message}` };
  }

  return { success: true };
}
