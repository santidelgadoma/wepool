"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimarPrecioViaje, VELOCIDAD_PROMEDIO_KMH, duracionDesdeMetros } from "@/lib/pricing";
import { calcularMatrizRutas } from "@/lib/rutas";
import { tieneSolicitudActivaEnDireccion } from "@/lib/actions/solicitudes";
import { tieneViajesSinCalificar } from "@/lib/actions/calificaciones";
import { MENSAJE_BLOQUEO_SIN_CALIFICAR } from "@/lib/etiquetas";

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
      // El lado "miRol === conductor" de este cálculo ya no puede volver
      // true en la práctica bajo el nuevo modelo de solicitudes urgentes
      // (ver lib/actions/solicitudes.ts): en cuanto un pasajero confirma, la
      // oferta del conductor pasa a 'pendiente' y misOfertas (arriba) deja
      // de incluirla, así que este candidato de conductor ni se genera en la
      // siguiente carga. Nota: por el mismo motivo, en cuanto el PASAJERO
      // confirma, su propia oferta también pasa a 'pendiente' — este mismo
      // candidato desaparece de su propia lista en la siguiente carga (en
      // vez de quedarse mostrando "falta que el conductor lo confirme" como
      // antes). El estado de espera visible y persistente ahora vive en
      // /home (ver obtenerEstadoPasajero), no aquí.
      puedoElegir: miRol === "conductor" ? m.passenger_confirmed : !m.passenger_confirmed,
    });
  }

  resultado.sort((a, b) => a.estimatedDurationMinutes - b.estimatedDurationMinutes);

  return { candidatos: resultado };
}

export type ElegirCandidatoState = { error?: string; success?: boolean };

/**
 * Primer paso del flujo de confirmación, versión "manual" (publicar en
 * /reserva como pasajero y elegir aquí en vez de usar el feed del home) —
 * ver docs/esquema_base_datos.md sección 5. El pasajero elige un candidato:
 * marca passenger_confirmed Y pasa ambas ofertas (la propia y la del
 * conductor) a status 'pendiente', exactamente igual que unirmeAViaje
 * (lib/actions/feed.ts) — mismo modelo de solicitud urgente/exclusiva sin
 * importar por cuál de los dos caminos llegó el pasajero. El conductor ya NO
 * "elige" acá: responde aceptar/rechazar desde el banner urgente global o
 * desde la lista de arriba en /consultar (ver lib/actions/solicitudes.ts).
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

    // Calificación obligatoria (ver lib/actions/calificaciones.ts) — también
    // aplica a elegir un candidato desde /consultar, no solo a publicar en
    // /reserva o unirse desde el feed.
    if (await tieneViajesSinCalificar(supabase, user.id)) {
      return { error: MENSAJE_BLOQUEO_SIN_CALIFICAR };
    }

    // Misma defensa en profundidad que unirmeAViaje (lib/actions/feed.ts) —
    // la UI ya debería impedir llegar aquí con una solicitud activa en esta
    // dirección, esto cubre la carrera de dos pestañas o un doble clic.
    const yaTieneSolicitud = await tieneSolicitudActivaEnDireccion(
      supabase,
      user.id,
      ofertaPasajero.direction as "ida" | "regreso"
    );
    if (yaTieneSolicitud) {
      return { error: "Ya tienes una solicitud en curso para este tipo de viaje." };
    }

    const { error } = await admin
      .from("trip_matches")
      .update({ passenger_confirmed: true })
      .eq("id", matchId);
    if (error) return { error: `No se pudo confirmar: ${error.message}` };

    // Ambas ofertas pasan a 'pendiente' — exclusivo mientras el conductor no
    // responda (ver lib/actions/solicitudes.ts): ningún otro pasajero puede
    // elegir esta misma oferta de conductor, y este pasajero no puede elegir
    // otro viaje de la misma dirección hasta que se resuelva.
    const { error: errorPendiente } = await admin
      .from("trip_offers")
      .update({ status: "pendiente" })
      .in("id", [ofertaConductor.id, ofertaPasajero.id]);
    if (errorPendiente) {
      console.error(
        "elegirCandidato: no se pudo marcar las ofertas como pendientes",
        errorPendiente
      );
    }

    revalidatePath("/consultar");
    revalidatePath("/home");
    revalidatePath("/cancelar");
    return { success: true };
  }

  // soyElConductor — bajo el nuevo modelo esta rama ya no debería ser
  // alcanzable en la práctica: en cuanto un pasajero elige (arriba), la
  // oferta del conductor pasa a 'pendiente' y deja de aparecer en
  // obtenerCandidatos (que filtra las ofertas propias por status =
  // 'buscando'), así que puedoElegir nunca vuelve true para el conductor. Se
  // deja como respuesta defensiva por si algún cliente queda con una
  // versión vieja de la página en caché. El conductor responde
  // aceptar/rechazar desde el banner urgente o desde /consultar (ver
  // lib/actions/solicitudes.ts::responderSolicitud).
  return {
    error: "Usa el panel de solicitudes pendientes para aceptar o rechazar este viaje.",
  };
}
