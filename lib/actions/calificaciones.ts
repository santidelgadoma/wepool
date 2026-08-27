"use server";

// Calificaciones mutuas conductor/pasajero por viaje confirmado (ver
// docs/diseno_chat_y_calificaciones.md sección B, decisiones confirmadas con
// el usuario el 27 de agosto de 2026: editable, comentarios públicos, y
// calificación obligatoria con bloqueo real -- con una opción "no se
// realizó" para no atrapar a nadie calificando un viaje fantasma). Cuelga de
// confirmed_trips, igual que trip_messages (lib/actions/mensajes.ts) --
// mismo razonamiento: ya identifica exactamente a los dos usuarios
// involucrados, así que se protege con RLS normal sin necesitar el cliente
// admin en ningún punto de este archivo.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ─── Bloqueo: ¿tiene el usuario viajes completados sin calificar? ──────────
// Calificación obligatoria (decisión confirmada con el usuario) = bloqueo
// real: no se puede publicar/reservar ni unirse a un viaje nuevo mientras
// haya un viaje `completado` sin una fila propia en trip_ratings. Se usa
// como defensa en profundidad en los tres puntos donde se crea un
// compromiso nuevo -- lib/actions/reserva.ts::crearOferta,
// lib/actions/feed.ts::unirmeAViaje, lib/actions/consultar.ts::elegirCandidato
// (rama pasajero) -- además de la tarjeta de bloqueo que ya muestra
// app/(app)/reserva/page.tsx antes de renderizar el formulario. El mensaje
// de error compartido (MENSAJE_BLOQUEO_SIN_CALIFICAR) vive en
// lib/etiquetas.ts, no aquí -- un archivo "use server" solo puede exportar
// funciones async, Next.js rechaza en build una constante de valor como esa.
async function idsViajesPorCalificar(
  supabase: SupabaseServerClient,
  userId: string
): Promise<string[]> {
  const { data: viajes } = await supabase
    .from("confirmed_trips")
    .select("id")
    .or(`driver_id.eq.${userId},passenger_id.eq.${userId}`)
    .eq("status", "completado");

  if (!viajes || viajes.length === 0) return [];

  const { data: yaCalificados } = await supabase
    .from("trip_ratings")
    .select("confirmed_trip_id")
    .eq("rater_id", userId)
    .in(
      "confirmed_trip_id",
      viajes.map((v) => v.id)
    );

  const idsYaCalificados = new Set((yaCalificados ?? []).map((r) => r.confirmed_trip_id));
  return viajes.map((v) => v.id).filter((id) => !idsYaCalificados.has(id));
}

export async function tieneViajesSinCalificar(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  return (await idsViajesPorCalificar(supabase, userId)).length > 0;
}

export type ViajePorCalificar = {
  confirmedTripId: string;
  contraparteId: string;
  contraparteNombre: string;
  direction: "ida" | "regreso";
  scheduledTime: string;
};

/**
 * Versión completa (con nombres) de la lista de arriba -- la usa
 * app/(app)/reserva/page.tsx para mostrar la tarjeta de bloqueo con detalle
 * de cuáles viajes faltan por calificar, en vez de solo un booleano.
 */
export async function obtenerViajesPorCalificar(): Promise<ViajePorCalificar[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: viajes } = await supabase
    .from("confirmed_trips")
    .select("id, direction, scheduled_time, driver_id, passenger_id")
    .or(`driver_id.eq.${user.id},passenger_id.eq.${user.id}`)
    .eq("status", "completado");

  if (!viajes || viajes.length === 0) return [];

  const idsPendientes = await idsViajesPorCalificar(supabase, user.id);
  const pendientesSet = new Set(idsPendientes);
  const pendientes = viajes.filter((v) => pendientesSet.has(v.id));
  if (pendientes.length === 0) return [];

  const idsContraparte = Array.from(
    new Set(pendientes.map((v) => (v.driver_id === user.id ? v.passenger_id : v.driver_id)))
  );
  const { data: perfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", idsContraparte);
  const mapaNombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  return pendientes.map((v) => {
    const contraparteId = v.driver_id === user.id ? v.passenger_id : v.driver_id;
    return {
      confirmedTripId: v.id,
      contraparteId,
      contraparteNombre:
        mapaNombre.get(contraparteId)?.trim().split(/\s+/)[0] || "la otra persona",
      direction: v.direction as "ida" | "regreso",
      scheduledTime: v.scheduled_time,
    };
  });
}

// ─── Calificar (o editar una calificación propia) ──────────────────────────

const calificacionSchema = z
  .object({
    confirmedTripId: z.string().uuid(),
    noShow: z.boolean(),
    stars: z.number().int().min(1).max(5).optional(),
    comment: z
      .string()
      .trim()
      .max(500, "El comentario es demasiado largo (máximo 500 caracteres).")
      .optional(),
  })
  .refine((datos) => datos.noShow || datos.stars !== undefined, {
    message: "Elige de 1 a 5 estrellas, o marca que el viaje no se realizó.",
    path: ["stars"],
  });

export type CalificarViajeState = { error?: string; success?: boolean };

/**
 * Inserta o actualiza (upsert sobre confirmed_trip_id+rater_id, ver
 * 0011_calificaciones.sql) la calificación propia de un viaje. Editable a
 * propósito (decisión confirmada) -- llamar de nuevo sobre el mismo viaje
 * sobrescribe la calificación anterior en vez de fallar. `noShow: true`
 * cuenta como "ya calificaste" para efectos del bloqueo de arriba, pero no
 * guarda estrellas ni mueve el promedio de nadie (el trigger de agregado en
 * 0011 usa count(stars), no count(*), así que las filas de no_show no se
 * cuentan).
 */
export async function calificarViaje(input: {
  confirmedTripId: string;
  noShow: boolean;
  stars?: number;
  comment?: string;
}): Promise<CalificarViajeState> {
  try {
    return await calificarViajeInterno(input);
  } catch (err) {
    console.error("calificarViaje: excepción no controlada", err);
    return { error: "Ocurrió un error inesperado al guardar la calificación." };
  }
}

async function calificarViajeInterno(input: {
  confirmedTripId: string;
  noShow: boolean;
  stars?: number;
  comment?: string;
}): Promise<CalificarViajeState> {
  const parseo = calificacionSchema.safeParse(input);
  if (!parseo.success) {
    return { error: parseo.error.issues[0]?.message ?? "Calificación inválida." };
  }
  const datos = parseo.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const { data: viaje, error: errorViaje } = await supabase
    .from("confirmed_trips")
    .select("id, driver_id, passenger_id, status")
    .eq("id", datos.confirmedTripId)
    .single();

  if (errorViaje || !viaje) {
    return { error: "Ese viaje no existe o no tienes acceso a él." };
  }
  if (viaje.driver_id !== user.id && viaje.passenger_id !== user.id) {
    return { error: "No tienes acceso a ese viaje." };
  }
  if (viaje.status !== "completado") {
    return { error: "Solo puedes calificar viajes ya completados." };
  }

  const rateeId = viaje.driver_id === user.id ? viaje.passenger_id : viaje.driver_id;

  const { error: errorUpsert } = await supabase.from("trip_ratings").upsert(
    {
      confirmed_trip_id: datos.confirmedTripId,
      rater_id: user.id,
      ratee_id: rateeId,
      stars: datos.noShow ? null : datos.stars,
      no_show: datos.noShow,
      comment: datos.comment || null,
    },
    { onConflict: "confirmed_trip_id,rater_id" }
  );

  if (errorUpsert) {
    return { error: `No se pudo guardar la calificación: ${errorUpsert.message}` };
  }

  revalidatePath("/historial");
  revalidatePath("/reserva");
  return { success: true };
}
