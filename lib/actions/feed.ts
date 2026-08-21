"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimarPrecioViaje, duracionDesdeMetros } from "@/lib/pricing";
import { rangoUTCDeManana } from "@/lib/datetime";
import { calcularMatrizRutas, calcularRutaReal } from "@/lib/rutas";
import { tieneSolicitudActivaEnDireccion } from "@/lib/actions/solicitudes";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";

const RADIO_KM = 15;
const LIMITE_FEED = 30;

export type FeedCandidato = {
  offerId: string;
  direction: "ida" | "regreso";
  scheduledTime: string;
  vehicleDescription: string | null;
  driverFirstName: string;
  distanceKm: number;
  duracionMinutos: number | null;
  precioPasajeroMXN: number;
};

type FilaFeedCruda = {
  id: string;
  direction: "ida" | "regreso";
  scheduled_time: string;
  driver_full_name: string | null;
  vehicle_description: string | null;
  home_lat: number;
  home_lng: number;
  distance_meters: number;
};

// Feed tipo Rappi/BlaBlaCar del home (ver PROGRESS.md, "Rediseño del home —
// feed de viajes"): a diferencia de obtenerCandidatos() en
// lib/actions/consultar.ts (que parte de una trip_offer PROPIA ya
// publicada), este parte de una ubicación guardada -- el pasajero todavía
// no tiene ninguna oferta cuando navega el feed, la crea hasta que elige un
// viaje (ver unirmeAViaje más abajo).
export async function obtenerFeed(
  savedLocationId: string
): Promise<{ error?: string; candidatos: FeedCandidato[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", candidatos: [] };
  }

  const [{ data: ubicacion }, { data: profile }] = await Promise.all([
    supabase
      .from("saved_locations")
      .select("id, lat, lng, user_id")
      .eq("id", savedLocationId)
      .single(),
    supabase.from("profiles").select("institution_id").eq("id", user.id).single(),
  ]);

  if (!ubicacion || ubicacion.user_id !== user.id) {
    return { error: "Esa ubicación ya no existe.", candidatos: [] };
  }
  if (!profile?.institution_id) {
    return { error: "Tu perfil no tiene institución asignada.", candidatos: [] };
  }

  const { inicio, fin } = rangoUTCDeManana();
  const admin = createAdminClient();
  const { data: crudos, error } = await admin.rpc("find_driver_offers_near", {
    p_lat: ubicacion.lat,
    p_lng: ubicacion.lng,
    p_institution_id: profile.institution_id,
    p_start_time: inicio,
    p_end_time: fin,
    p_radius_km: RADIO_KM,
    p_limit: LIMITE_FEED,
  });

  if (error) {
    return { error: `No se pudo cargar el feed: ${error.message}`, candidatos: [] };
  }

  const filas = (crudos ?? []) as FilaFeedCruda[];

  // Una sola llamada a Google Routes API para todo el feed (1 origen — la
  // ubicación guardada — × N conductores ya prefiltrados geoespacialmente
  // por find_driver_offers_near) en vez de una por tarjeta. `rutas[i]` es
  // `null` si Google no está configurado, no respondió, o no encontró ruta
  // en auto para ese conductor en particular; esa tarjeta cae a la
  // distancia en línea recta que la función SQL ya traía (ver
  // lib/rutas.ts).
  const rutas = await calcularMatrizRutas(
    { lat: ubicacion.lat, lng: ubicacion.lng },
    filas.map((f) => ({ lat: f.home_lat, lng: f.home_lng }))
  );

  const candidatos: FeedCandidato[] = filas.map((fila, i) => {
    const ruta = rutas[i];
    const distanceKm = ruta ? ruta.distanciaKm : fila.distance_meters / 1000;
    const { precioPasajeroMXN } = estimarPrecioViaje(distanceKm);
    return {
      offerId: fila.id,
      direction: fila.direction,
      scheduledTime: fila.scheduled_time,
      vehicleDescription: fila.vehicle_description,
      driverFirstName: fila.driver_full_name?.trim().split(/\s+/)[0] || "Conductor",
      distanceKm,
      duracionMinutos: ruta ? ruta.duracionMinutos : null,
      precioPasajeroMXN,
    };
  });

  return { candidatos };
}

export type UnirmeState = { error?: string; success?: boolean };

// Colapsa en un solo paso lo que antes eran dos (publicar oferta propia en
// /reserva + confirmar candidato en /consultar): elegir una tarjeta del feed
// crea la trip_offer del pasajero Y la marca como confirmada
// (passenger_confirmed = true) en la misma acción, y ambas ofertas pasan a
// 'pendiente' (ver más abajo) -- el conductor responde aceptar/rechazar
// desde el banner urgente global o /consultar (ver lib/actions/solicitudes.ts,
// PROGRESS.md "Solicitudes urgentes").
export async function unirmeAViaje(
  driverOfferId: string,
  savedLocationId: string
): Promise<UnirmeState> {
  try {
    return await unirmeAViajeInterno(driverOfferId, savedLocationId);
  } catch (err) {
    console.error("unirmeAViaje: excepción no controlada", err);
    return { error: "Ocurrió un error inesperado al unirte al viaje." };
  }
}

async function unirmeAViajeInterno(
  driverOfferId: string,
  savedLocationId: string
): Promise<UnirmeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const { data: ubicacion } = await supabase
    .from("saved_locations")
    .select("id, address_text, lat, lng, user_id")
    .eq("id", savedLocationId)
    .single();

  if (!ubicacion || ubicacion.user_id !== user.id) {
    return { error: "Esa ubicación ya no existe." };
  }

  // La oferta del conductor pertenece a otro usuario -- trip_offers solo se
  // puede leer directo con el cliente admin (RLS: "owner manages own
  // offers"), igual que en obtenerCandidatos/elegirCandidato
  // (lib/actions/consultar.ts).
  const admin = createAdminClient();
  const { data: ofertaConductor } = await admin
    .from("trip_offers")
    .select("id, direction, role, status, scheduled_time, home_lat, home_lng")
    .eq("id", driverOfferId)
    .single();

  if (
    !ofertaConductor ||
    ofertaConductor.role !== "conductor" ||
    ofertaConductor.status !== "buscando"
  ) {
    return { error: "Ese viaje ya no está disponible. Actualiza la página." };
  }

  // Defensa en profundidad (ver lib/actions/solicitudes.ts): el home ya
  // oculta el feed de una dirección mientras el usuario tiene una solicitud
  // pendiente o confirmada, pero esto cubre el caso de dos pestañas abiertas
  // o un doble clic antes de que la UI se actualice.
  const yaTieneSolicitud = await tieneSolicitudActivaEnDireccion(
    supabase,
    user.id,
    ofertaConductor.direction as "ida" | "regreso"
  );
  if (yaTieneSolicitud) {
    return {
      error: `Ya tienes una solicitud de ${ETIQUETA_DIRECCION[
        ofertaConductor.direction as "ida" | "regreso"
      ].toLowerCase()} en curso. Espera la respuesta del conductor.`,
    };
  }

  const { data: ofertaPasajero, error: errorInsert } = await supabase
    .from("trip_offers")
    .insert({
      user_id: user.id,
      direction: ofertaConductor.direction,
      role: "pasajero",
      vehicle_id: null,
      home_address: ubicacion.address_text,
      home_location: `POINT(${ubicacion.lng} ${ubicacion.lat})`,
      home_lat: ubicacion.lat,
      home_lng: ubicacion.lng,
      scheduled_time: ofertaConductor.scheduled_time,
      uses_toll_roads: null,
      meeting_point: null,
      status: "pendiente",
    })
    .select("id")
    .single();

  if (errorInsert || !ofertaPasajero) {
    return { error: `No se pudo unir al viaje: ${errorInsert?.message ?? "error desconocido"}` };
  }

  // Ruta real (Google Routes API) para este par específico -- ya se sabe
  // exactamente con qué conductor se está emparejando, así que es una sola
  // ruta, no una matriz (ver lib/rutas.ts). Si Google no está configurado,
  // no respondió, o no encontró ruta en auto, se cae al estimado de línea
  // recta de siempre (distance_between_offers + duracionDesdeMetros).
  const ruta = await calcularRutaReal(
    { lat: ofertaConductor.home_lat, lng: ofertaConductor.home_lng },
    { lat: ubicacion.lat, lng: ubicacion.lng }
  );

  let duracionEstimada: number;
  let distanciaKm: number | null;
  if (ruta) {
    duracionEstimada = ruta.duracionMinutos;
    distanciaKm = ruta.distanciaKm;
  } else {
    const { data: distanciaMetros } = await admin.rpc("distance_between_offers", {
      p_offer_id_1: driverOfferId,
      p_offer_id_2: ofertaPasajero.id,
    });
    duracionEstimada = duracionDesdeMetros(Number(distanciaMetros ?? 0));
    distanciaKm = null;
  }

  // trip_matches no tiene policy de insert para el rol authenticated (solo
  // select/update, ver 0001_init_schema.sql) -- por diseño, solo el
  // servidor con la llave de servicio puede crear matches.
  const { error: errorMatch } = await admin.from("trip_matches").insert({
    driver_offer_id: driverOfferId,
    passenger_offer_id: ofertaPasajero.id,
    estimated_duration_minutes: duracionEstimada,
    distance_km: distanciaKm,
    passenger_confirmed: true,
  });

  if (errorMatch) {
    return {
      error: `Te uniste al viaje pero no se pudo registrar la confirmación: ${errorMatch.message}`,
    };
  }

  // La oferta del conductor pasa a 'pendiente' -- deja de aparecer en el
  // feed de cualquier otro pasajero (find_driver_offers_near filtra por
  // status = 'buscando') hasta que el conductor acepte o rechace esta
  // solicitud (ver lib/actions/solicitudes.ts, notificación urgente en
  // app/(app)/layout.tsx). Se hace después de crear el match, no antes, para
  // no dejar la oferta bloqueada si el insert de arriba falla.
  const { error: errorMarcarPendiente } = await admin
    .from("trip_offers")
    .update({ status: "pendiente" })
    .eq("id", driverOfferId);

  if (errorMarcarPendiente) {
    console.error(
      "unirmeAViaje: no se pudo marcar la oferta del conductor como pendiente",
      errorMarcarPendiente
    );
  }

  revalidatePath("/home");
  revalidatePath("/consultar");
  revalidatePath("/cancelar");
  return { success: true };
}
