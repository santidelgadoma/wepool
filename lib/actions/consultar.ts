"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimarPrecioViaje, VELOCIDAD_PROMEDIO_KMH, duracionDesdeMetros } from "@/lib/pricing";
import { calcularMatrizRutas } from "@/lib/rutas";

const RADIO_KM = 15;
const VENTANA_MINUTOS = 30;
const LIMITE_CANDIDATOS = 20;

export type CandidatoVista = {
  matchId: string;
  miRol: "conductor" | "pasajero";
  contraparteRol: "conductor" | "pasajero";
  direction: "ida" | "regreso";
  scheduledTime: string;
  estimatedDurationMinutes: number;
  precioPasajeroMXN: number;
  gananciaConductorMXN: number;
  passengerConfirmed: boolean;
  puedoElegir: boolean;
};

type OfertaPropia = {
  id: string;
  role: "conductor" | "pasajero";
  direction: "ida" | "regreso";
  scheduled_time: string;
  home_lat: number;
  home_lng: number;
};

type OfertaContraparte = {
  id: string;
  role: "conductor" | "pasajero";
  direction: "ida" | "regreso";
  scheduled_time: string;
  status: string;
};

/**
 * Recalcula candidatos para todas las ofertas activas del usuario (usando el
 * pre-filtro geoespacial find_candidate_offers) y devuelve la lista lista
 * para mostrar. Se llama directamente desde la pantalla /consultar en cada
 * visita — no expone direcciones exactas de la contraparte, solo hora
 * estimada y duración (ver docs/esquema_base_datos.md sección 3).
 */
export async function obtenerCandidatos(): Promise<{
  error?: string;
  candidatos: CandidatoVista[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", candidatos: [] };
  }

  const { data: misOfertas, error: errorOfertas } = await supabase
    .from("trip_offers")
    .select("id, role, direction, scheduled_time, home_lat, home_lng")
    .eq("user_id", user.id)
    .eq("status", "buscando");

  if (errorOfertas) {
    return {
      error: `No se pudieron leer tus reservaciones: ${errorOfertas.message}`,
      candidatos: [],
    };
  }
  if (!misOfertas || misOfertas.length === 0) {
    return { candidatos: [] };
  }

  const admin = createAdminClient();

  for (const oferta of misOfertas as OfertaPropia[]) {
    const { data: candidatosCrudos } = await admin.rpc("find_candidate_offers", {
      p_offer_id: oferta.id,
      p_radius_km: RADIO_KM,
      p_time_window_minutes: VENTANA_MINUTOS,
      p_limit: LIMITE_CANDIDATOS,
    });

    // find_candidate_offers regresa `setof trip_offers` completo (select
    // o2.*), así que candidato.home_lat/home_lng ya vienen incluidos sin
    // ninguna consulta extra (ver 0007_rutas_reales.sql).
    const candidatos = (candidatosCrudos ?? []) as Array<{
      id: string;
      home_lat: number;
      home_lng: number;
    }>;

    if (candidatos.length === 0) continue;

    // Una sola llamada a Google Routes API por oferta propia (1 origen × N
    // candidatos ya prefiltrados por PostGIS) en vez de una llamada por
    // candidato — ver lib/rutas.ts. `ruta` es `null` para un candidato si
    // Google no está configurado, no respondió, o no encontró ruta en auto
    // para ese par en particular; se cae al estimado de línea recta de
    // siempre solo para esos casos (no para todos, para no gastar una
    // llamada extra de más).
    const rutas = await calcularMatrizRutas(
      { lat: oferta.home_lat, lng: oferta.home_lng },
      candidatos.map((c) => ({ lat: c.home_lat, lng: c.home_lng }))
    );

    for (let i = 0; i < candidatos.length; i++) {
      const candidato = candidatos[i];
      const ruta = rutas[i];

      let duracionEstimada: number;
      let distanciaKm: number | null;
      if (ruta) {
        duracionEstimada = ruta.duracionMinutos;
        distanciaKm = ruta.distanciaKm;
      } else {
        const { data: distanciaMetros } = await admin.rpc("distance_between_offers", {
          p_offer_id_1: oferta.id,
          p_offer_id_2: candidato.id,
        });
        duracionEstimada = duracionDesdeMetros(Number(distanciaMetros ?? 0));
        distanciaKm = null;
      }

      const esOfertaConductor = oferta.role === "conductor";
      await admin.from("trip_matches").upsert(
        {
          driver_offer_id: esOfertaConductor ? oferta.id : candidato.id,
          passenger_offer_id: esOfertaConductor ? candidato.id : oferta.id,
          estimated_duration_minutes: duracionEstimada,
          distance_km: distanciaKm,
        },
        { onConflict: "driver_offer_id,passenger_offer_id", ignoreDuplicates: true }
      );
    }
  }

  const idsMisOfertas = misOfertas.map((o) => o.id);
  const mapaMisOfertas = new Map(misOfertas.map((o) => [o.id, o as OfertaPropia]));
  const filtroOr =
    idsMisOfertas.map((id) => `driver_offer_id.eq.${id}`).join(",") +
    "," +
    idsMisOfertas.map((id) => `passenger_offer_id.eq.${id}`).join(",");

  const { data: matches, error: errorMatches } = await admin
    .from("trip_matches")
    .select(
      "id, driver_offer_id, passenger_offer_id, estimated_duration_minutes, distance_km, passenger_confirmed"
    )
    .or(filtroOr);

  if (errorMatches || !matches) {
    return {
      error: `No se pudieron leer los candidatos: ${errorMatches?.message ?? "error desconocido"}`,
      candidatos: [],
    };
  }

  const idsContraparte = Array.from(
    new Set(
      matches.map((m) =>
        idsMisOfertas.includes(m.driver_offer_id) ? m.passenger_offer_id : m.driver_offer_id
      )
    )
  );

  let ofertasContraparte: OfertaContraparte[] = [];
  if (idsContraparte.length > 0) {
    const { data } = await admin
      .from("trip_offers")
      .select("id, role, direction, scheduled_time, status")
      .in("id", idsContraparte);
    ofertasContraparte = (data ?? []) as OfertaContraparte[];
  }

  const mapaContraparte = new Map(ofertasContraparte.map((o) => [o.id, o]));

  const resultado: CandidatoVista[] = [];

  for (const m of matches) {
    const esMiaLaDeConductor = idsMisOfertas.includes(m.driver_offer_id);
    const miOfferId = esMiaLaDeConductor ? m.driver_offer_id : m.passenger_offer_id;
    const contraparteId = esMiaLaDeConductor ? m.passenger_offer_id : m.driver_offer_id;
    const miOferta = mapaMisOfertas.get(miOfferId);
    const contraparte = mapaContraparte.get(contraparteId);

    // La oferta de la contraparte pudo haberse cancelado o confirmarse con
    // alguien más entre que se generó el match y ahora.
    if (!miOferta || !contraparte || contraparte.status !== "buscando") continue;

    const miRol: "conductor" | "pasajero" = esMiaLaDeConductor ? "conductor" : "pasajero";

    // El precio se calcula por distancia (lib/pricing.ts::estimarPrecioViaje).
    // Usa la distancia real de manejo (m.distance_km, de Google Routes API)
    // cuando está disponible; si no (match creado antes de la integración,
    // o Google no respondió en su momento), cae a reconstruirla desde la
    // duración guardada con la velocidad promedio — mismo fallback que
    // lib/pricing.ts::precioDeMatchEmbebido usa en /manana y /historial.
    const distanciaKmEstimada =
      m.distance_km ?? (m.estimated_duration_minutes / 60) * VELOCIDAD_PROMEDIO_KMH;
    const { precioPasajeroMXN, gananciaConductorMXN } = estimarPrecioViaje(distanciaKmEstimada);

    resultado.push({
      matchId: m.id,
      miRol,
      contraparteRol: miRol === "conductor" ? "pasajero" : "conductor",
      direction: miOferta.direction,
      scheduledTime: contraparte.scheduled_time,
      estimatedDurationMinutes: m.estimated_duration_minutes,
      precioPasajeroMXN,
      gananciaConductorMXN,
      passengerConfirmed: m.passenger_confirmed,
      puedoElegir: miRol === "conductor" ? m.passenger_confirmed : !m.passenger_confirmed,
    });
  }

  resultado.sort((a, b) => a.estimatedDurationMinutes - b.estimatedDurationMinutes);

  return { candidatos: resultado };
}

export type ElegirCandidatoState = { error?: string; success?: boolean };

/**
 * Segundo paso del flujo de confirmación (docs/esquema_base_datos.md sección
 * 5): el pasajero elige un candidato (marca passenger_confirmed), y luego el
 * conductor elige entre los candidatos ya confirmados por un pasajero — eso
 * crea la fila en confirmed_trips y borra las ofertas de ambos usuarios.
 */
export async function elegirCandidato(matchId: string): Promise<ElegirCandidatoState> {
  try {
    return await elegirCandidatoInterno(matchId);
  } catch (err) {
    // Cualquier excepción no controlada (network, bug de tipos, lo que sea)
    // se convierte en un {error} legible en vez de dejar que la Server
    // Action rechace la promesa del lado del cliente en silencio. Se loguea
    // completo aquí porque esto SÍ aparece en la terminal donde corre
    // `npm run dev` (y en el output "[WebServer]" que captura Playwright).
    console.error("elegirCandidato: excepción no controlada", err);
    return { error: "Ocurrió un error inesperado al confirmar el viaje." };
  }
}

async function elegirCandidatoInterno(matchId: string): Promise<ElegirCandidatoState> {
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
    .select("id, driver_offer_id, passenger_offer_id, passenger_confirmed")
    .eq("id", matchId)
    .single();

  if (errorMatch || !match) {
    return { error: "Ese candidato ya no está disponible." };
  }

  const { data: ofertas, error: errorOfertas } = await admin
    .from("trip_offers")
    .select(
      "id, user_id, role, direction, vehicle_id, home_address, scheduled_time, meeting_point, status"
    )
    .in("id", [match.driver_offer_id, match.passenger_offer_id]);

  if (errorOfertas || !ofertas || ofertas.length !== 2) {
    return { error: "Ese candidato ya no está disponible." };
  }

  const ofertaConductor = ofertas.find((o) => o.id === match.driver_offer_id);
  const ofertaPasajero = ofertas.find((o) => o.id === match.passenger_offer_id);

  if (!ofertaConductor || !ofertaPasajero) {
    return { error: "Ese candidato ya no está disponible." };
  }
  if (ofertaConductor.status !== "buscando" || ofertaPasajero.status !== "buscando") {
    return { error: "Ese viaje ya se confirmó o canceló con alguien más." };
  }

  const soyElConductor = ofertaConductor.user_id === user.id;
  const soyElPasajero = ofertaPasajero.user_id === user.id;

  if (!soyElConductor && !soyElPasajero) {
    return { error: "No tienes permiso sobre esta reservación." };
  }

  if (soyElPasajero) {
    if (match.passenger_confirmed) {
      return { error: "Ya habías elegido este viaje." };
    }
    const { error } = await admin
      .from("trip_matches")
      .update({ passenger_confirmed: true })
      .eq("id", matchId);
    if (error) return { error: `No se pudo confirmar: ${error.message}` };
    revalidatePath("/consultar");
    return { success: true };
  }

  // soyElConductor
  if (!match.passenger_confirmed) {
    return { error: "Este pasajero todavía no ha elegido este viaje." };
  }

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
    return { error: `No se pudo confirmar el viaje: ${errorConfirmado.message}` };
  }

  // No se borran ni las ofertas ni el trip_matches que las conecta. El
  // schema real (0001_init_schema.sql) tiene trip_offers -> trip_matches con
  // ON DELETE CASCADE, PERO confirmed_trips.match_id -> trip_matches NO lo
  // tiene, a propósito, para conservar el vínculo histórico con el match que
  // originó la confirmación. Eso significa que el trip_matches recién usado
  // para crear este confirmed_trips es, por diseño, imposible de borrar — ni
  // directo ni por cascada al borrar trip_offers. Intentarlo revienta con
  // "violates foreign key constraint confirmed_trips_match_id_fkey" (este
  // fue el bug real que encontró el test E2E, ver PROGRESS.md).
  //
  // En vez de borrar, se marca la oferta como 'confirmado' — trip_offer_status
  // ya incluye ese valor en el enum, sin usar hasta ahora. obtenerCandidatos()
  // filtra por status = 'buscando', así que una oferta confirmada deja de
  // aparecer como candidato para cualquiera sin necesidad de tocar
  // trip_matches ni trip_offers vía delete.
  const { error: errorActualizarOfertas } = await admin
    .from("trip_offers")
    .update({ status: "confirmado" })
    .in("id", [ofertaConductor.id, ofertaPasajero.id]);

  if (errorActualizarOfertas) {
    console.error(
      "elegirCandidato: no se pudo actualizar el status de las ofertas",
      errorActualizarOfertas
    );
    return {
      error: `El viaje se confirmó pero no se pudo actualizar el status de las ofertas: ${errorActualizarOfertas.message}`,
    };
  }

  revalidatePath("/consultar");
  revalidatePath("/manana");
  revalidatePath("/historial");
  revalidatePath("/reserva");
  revalidatePath("/cancelar");
  return { success: true };
}
