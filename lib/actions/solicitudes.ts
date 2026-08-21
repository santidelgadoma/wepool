"use server";

// Solicitud urgente conductor <-> pasajero (ver PROGRESS.md, "Solicitudes
// urgentes: escoger un viaje pasa a ser aceptar/rechazar"). Antes de este
// archivo, "elegir un viaje" (feed o /consultar) solo marcaba
// trip_matches.passenger_confirmed = true y el conductor tenía que ir a
// /consultar a "elegir" entre los candidatos ya confirmados -- sin urgencia
// ni exclusividad (varios pasajeros podían confirmar el mismo viaje de
// conductor a la vez). Este archivo centraliza el nuevo modelo:
//
//   pasajero elige -> ambas ofertas pasan a 'pendiente' (exclusivo, nadie
//   más puede elegir ese viaje de conductor mientras tanto) -> el conductor
//   ve una notificación urgente en TODAS las pantallas (banner en
//   app/(app)/layout.tsx) y responde aceptar/rechazar -> si acepta, ambas
//   ofertas pasan a 'confirmado' (igual que el flujo viejo); si rechaza, la
//   oferta del conductor vuelve a 'buscando' (disponible de nuevo para
//   cualquiera) y la del pasajero pasa a 'rechazado' -- se le avisa la
//   próxima vez que abre el home y se limpia sola (ver
//   obtenerEstadoPasajero).
//
// Requiere supabase/migrations/0008_solicitudes_urgentes.sql aplicada (los
// valores 'pendiente'/'rechazado' del enum trip_offer_status).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimarPrecioViaje, VELOCIDAD_PROMEDIO_KMH } from "@/lib/pricing";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type Direccion = "ida" | "regreso";

// ─── Lado conductor: solicitudes pendientes por responder ───────────────────

export type SolicitudPendienteConductor = {
  matchId: string;
  direction: Direccion;
  scheduledTime: string;
  passengerFirstName: string;
  precioPasajeroMXN: number;
  gananciaConductorMXN: number;
  duracionMinutos: number;
};

/**
 * Todas las solicitudes que un conductor tiene pendientes de responder ahora
 * mismo (una por cada oferta propia en status 'pendiente'). Se llama tanto
 * desde el banner urgente global (app/(app)/layout.tsx, en cada pantalla)
 * como desde /consultar (misma lista, sin el estilo "urgente").
 */
export async function obtenerSolicitudesPendientesConductor(): Promise<
  SolicitudPendienteConductor[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: misOfertasPendientes } = await supabase
    .from("trip_offers")
    .select("id, direction, scheduled_time")
    .eq("user_id", user.id)
    .eq("role", "conductor")
    .eq("status", "pendiente");

  if (!misOfertasPendientes || misOfertasPendientes.length === 0) return [];

  const admin = createAdminClient();
  const idsOfertas = misOfertasPendientes.map((o) => o.id);

  const { data: matches } = await admin
    .from("trip_matches")
    .select("id, driver_offer_id, passenger_offer_id, estimated_duration_minutes, distance_km")
    .in("driver_offer_id", idsOfertas);

  if (!matches || matches.length === 0) return [];

  const idsPasajero = matches.map((m) => m.passenger_offer_id);
  const { data: ofertasPasajero } = await admin
    .from("trip_offers")
    .select("id, user_id")
    .in("id", idsPasajero);

  const idsUsuariosPasajero = Array.from(
    new Set((ofertasPasajero ?? []).map((o) => o.user_id))
  );
  const { data: perfiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", idsUsuariosPasajero);

  const mapaOfertaPropia = new Map(misOfertasPendientes.map((o) => [o.id, o]));
  const mapaUsuarioPasajero = new Map((ofertasPasajero ?? []).map((o) => [o.id, o.user_id]));
  const mapaNombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  const resultado: SolicitudPendienteConductor[] = matches
    .map((m) => {
      const ofertaPropia = mapaOfertaPropia.get(m.driver_offer_id);
      if (!ofertaPropia) return null;
      const userIdPasajero = mapaUsuarioPasajero.get(m.passenger_offer_id);
      const nombreCompleto = (userIdPasajero && mapaNombre.get(userIdPasajero)) || "Pasajero";
      const distanciaKmEstimada =
        m.distance_km ?? (m.estimated_duration_minutes / 60) * VELOCIDAD_PROMEDIO_KMH;
      const { precioPasajeroMXN, gananciaConductorMXN } = estimarPrecioViaje(distanciaKmEstimada);
      return {
        matchId: m.id,
        direction: ofertaPropia.direction as Direccion,
        scheduledTime: ofertaPropia.scheduled_time,
        passengerFirstName: nombreCompleto.trim().split(/\s+/)[0] || "Pasajero",
        precioPasajeroMXN,
        gananciaConductorMXN,
        duracionMinutos: m.estimated_duration_minutes,
      };
    })
    .filter((s): s is SolicitudPendienteConductor => s !== null);

  resultado.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return resultado;
}

// ─── Lado pasajero: bloqueo por dirección + aviso de rechazo ────────────────

export type EstadoDireccion = "ninguna" | "pendiente" | "confirmado";

export type EstadoPasajero = {
  estados: Record<Direccion, EstadoDireccion>;
  avisosRechazo: Direccion[];
};

/**
 * Estado del pasajero para ambas direcciones (ida/regreso), usado en el home
 * para bloquear el feed de una dirección mientras hay una solicitud
 * pendiente o ya confirmada, y para mostrar el aviso de "el conductor
 * rechazó tu solicitud" una sola vez. El aviso de rechazo se limpia solo
 * (borra la oferta en status 'rechazado') en cuanto se lee aquí -- no hay
 * notificaciones push en tiempo real, así que este es el único momento en el
 * que el pasajero se entera, pero no queremos que el aviso se quede pegado
 * para siempre.
 */
export async function obtenerEstadoPasajero(): Promise<EstadoPasajero> {
  const vacio: EstadoPasajero = { estados: { ida: "ninguna", regreso: "ninguna" }, avisosRechazo: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return vacio;

  const { data: ofertas, error: errorOfertas } = await supabase
    .from("trip_offers")
    .select("id, direction, status")
    .eq("user_id", user.id)
    .eq("role", "pasajero")
    .in("status", ["pendiente", "confirmado", "rechazado"]);

  // Antes esta consulta no revisaba `error` -- si fallaba (p.ej. porque la
  // migración 0008_solicitudes_urgentes.sql, que agrega los valores
  // 'pendiente'/'rechazado' al enum, no se había aplicado todavía), el
  // bloqueo por dirección simplemente no aparecía sin ningún rastro en
  // ningún lado. Ahora se loguea para poder diagnosticarlo desde la terminal
  // donde corre `npm run dev`.
  if (errorOfertas) {
    console.error("obtenerEstadoPasajero: no se pudieron leer las ofertas propias", errorOfertas);
    return vacio;
  }
  if (!ofertas || ofertas.length === 0) return vacio;

  const estados: Record<Direccion, EstadoDireccion> = { ida: "ninguna", regreso: "ninguna" };
  const avisosRechazo: Direccion[] = [];
  const idsParaLimpiar: string[] = [];

  for (const oferta of ofertas as Array<{ id: string; direction: Direccion; status: string }>) {
    if (oferta.status === "rechazado") {
      avisosRechazo.push(oferta.direction);
      idsParaLimpiar.push(oferta.id);
      continue;
    }
    if (oferta.status === "confirmado") {
      estados[oferta.direction] = "confirmado";
    } else if (oferta.status === "pendiente" && estados[oferta.direction] !== "confirmado") {
      estados[oferta.direction] = "pendiente";
    }
  }

  if (idsParaLimpiar.length > 0) {
    // "owner manages own offers" (0001_init_schema.sql) permite borrar con
    // el cliente normal -- son ofertas del propio usuario, no hace falta el
    // cliente admin aquí.
    await supabase.from("trip_offers").delete().in("id", idsParaLimpiar);
  }

  return { estados, avisosRechazo };
}

/**
 * true si el usuario ya tiene una oferta de pasajero activa (pendiente de
 * respuesta o ya confirmada) para esa dirección -- usado como defensa en
 * profundidad en unirmeAViaje (lib/actions/feed.ts) y en el paso de elegir
 * candidato como pasajero (lib/actions/consultar.ts) para evitar que dos
 * pestañas o un doble clic dejen a alguien con dos solicitudes de ida (o de
 * regreso) al mismo tiempo -- la UI ya oculta el feed de esa dirección, pero
 * esto cubre la carrera.
 */
export async function tieneSolicitudActivaEnDireccion(
  supabase: SupabaseServerClient,
  userId: string,
  direction: Direccion
): Promise<boolean> {
  const { data } = await supabase
    .from("trip_offers")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "pasajero")
    .eq("direction", direction)
    .in("status", ["pendiente", "confirmado"])
    .limit(1);
  return !!(data && data.length > 0);
}

// ─── Responder (aceptar / rechazar) ──────────────────────────────────────────

export type ResponderSolicitudState = { error?: string; success?: boolean };

/**
 * El conductor responde a una solicitud pendiente. Reemplaza la rama
 * "soyElConductor" que antes vivía en elegirCandidato
 * (lib/actions/consultar.ts) -- esa rama ya no es alcanzable en la práctica
 * bajo el nuevo modelo (una oferta de conductor deja de aparecer en
 * obtenerCandidatos en cuanto pasa a 'pendiente'), así que toda la lógica de
 * "aceptar" vive aquí ahora. "Rechazar" es completamente nuevo -- antes no
 * existía ninguna forma de decirle que no a un pasajero, solo ignorarlo.
 */
export async function responderSolicitud(
  matchId: string,
  accion: "aceptar" | "rechazar"
): Promise<ResponderSolicitudState> {
  try {
    return await responderSolicitudInterno(matchId, accion);
  } catch (err) {
    console.error("responderSolicitud: excepción no controlada", err);
    return { error: "Ocurrió un error inesperado al responder la solicitud." };
  }
}

async function responderSolicitudInterno(
  matchId: string,
  accion: "aceptar" | "rechazar"
): Promise<ResponderSolicitudState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const admin = createAdminClient();

  const { data: match, error: errorMatch } = await admin
    .from("trip_matches")
    .select("id, driver_offer_id, passenger_offer_id")
    .eq("id", matchId)
    .single();

  if (errorMatch || !match) {
    return { error: "Esa solicitud ya no está disponible." };
  }

  const { data: ofertas, error: errorOfertas } = await admin
    .from("trip_offers")
    .select(
      "id, user_id, role, direction, vehicle_id, home_address, scheduled_time, meeting_point, status"
    )
    .in("id", [match.driver_offer_id, match.passenger_offer_id]);

  if (errorOfertas || !ofertas || ofertas.length !== 2) {
    return { error: "Esa solicitud ya no está disponible." };
  }

  const ofertaConductor = ofertas.find((o) => o.id === match.driver_offer_id);
  const ofertaPasajero = ofertas.find((o) => o.id === match.passenger_offer_id);

  if (!ofertaConductor || !ofertaPasajero) {
    return { error: "Esa solicitud ya no está disponible." };
  }
  if (ofertaConductor.user_id !== user.id) {
    return { error: "No tienes permiso sobre esta solicitud." };
  }
  if (ofertaConductor.status !== "pendiente" || ofertaPasajero.status !== "pendiente") {
    return { error: "Esa solicitud ya se respondió o ya no está disponible." };
  }

  if (accion === "rechazar") {
    const { error: errorConductor } = await admin
      .from("trip_offers")
      .update({ status: "buscando" })
      .eq("id", ofertaConductor.id);
    if (errorConductor) {
      return { error: `No se pudo rechazar la solicitud: ${errorConductor.message}` };
    }

    // 'rechazado' es transitorio -- solo existe para que obtenerEstadoPasajero
    // (arriba) le muestre el aviso al pasajero una vez y luego borre la
    // oferta. Si esta actualización falla, la oferta del pasajero se queda
    // en 'pendiente' -- no bloquea nada crítico (la del conductor ya volvió
    // a 'buscando'), pero el pasajero se quedaría bloqueado sin aviso, así
    // que se loguea para poder darle seguimiento manual.
    const { error: errorPasajero } = await admin
      .from("trip_offers")
      .update({ status: "rechazado" })
      .eq("id", ofertaPasajero.id);
    if (errorPasajero) {
      console.error(
        "responderSolicitud: no se pudo marcar la oferta del pasajero como rechazada",
        errorPasajero
      );
    }

    // El match ya cumplió su propósito -- se borra para no dejar basura (a
    // diferencia de un match aceptado, que se conserva por el vínculo
    // histórico con confirmed_trips, ver elegirCandidato/consultar.ts).
    await admin.from("trip_matches").delete().eq("id", matchId);

    revalidatePath("/home");
    revalidatePath("/consultar");
    revalidatePath("/cancelar");
    return { success: true };
  }

  // accion === "aceptar" -- misma lógica que antes vivía en elegirCandidato.
  const { error: errorConfirmado } = await admin.from("confirmed_trips").insert({
    match_id: match.id,
    driver_id: ofertaConductor.user_id,
    passenger_id: ofertaPasajero.user_id,
    direction: ofertaConductor.direction,
    vehicle_id: ofertaConductor.vehicle_id,
    home_address: ofertaPasajero.home_address,
    scheduled_time: ofertaConductor.scheduled_time,
    meeting_point: ofertaConductor.meeting_point,
  });

  if (errorConfirmado) {
    return { error: `No se pudo aceptar la solicitud: ${errorConfirmado.message}` };
  }

  const { error: errorActualizarOfertas } = await admin
    .from("trip_offers")
    .update({ status: "confirmado" })
    .in("id", [ofertaConductor.id, ofertaPasajero.id]);

  if (errorActualizarOfertas) {
    console.error(
      "responderSolicitud: no se pudo actualizar el status de las ofertas",
      errorActualizarOfertas
    );
    return {
      error: `La solicitud se aceptó pero no se pudo actualizar el status de las ofertas: ${errorActualizarOfertas.message}`,
    };
  }

  revalidatePath("/home");
  revalidatePath("/consultar");
  revalidatePath("/manana");
  revalidatePath("/historial");
  revalidatePath("/reserva");
  revalidatePath("/cancelar");
  return { success: true };
}
