"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimarPrecioViaje, VELOCIDAD_PROMEDIO_KMH } from "@/lib/pricing";
import { rangoUTCDeManana } from "@/lib/datetime";

const RADIO_KM = 15;
const LIMITE_FEED = 30;

export type FeedCandidato = {
  offerId: string;
  direction: "ida" | "regreso";
  scheduledTime: string;
  vehicleDescription: string | null;
  driverFirstName: string;
  distanceKm: number;
  precioPasajeroMXN: number;
};

type FilaFeedCruda = {
  id: string;
  direction: "ida" | "regreso";
  scheduled_time: string;
  driver_full_name: string | null;
  vehicle_description: string | null;
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

  const candidatos: FeedCandidato[] = ((crudos ?? []) as FilaFeedCruda[]).map((fila) => {
    const distanceKm = fila.distance_meters / 1000;
    const { precioPasajeroMXN } = estimarPrecioViaje(distanceKm);
    return {
      offerId: fila.id,
      direction: fila.direction,
      scheduledTime: fila.scheduled_time,
      vehicleDescription: fila.vehicle_description,
      driverFirstName: fila.driver_full_name?.trim().split(/\s+/)[0] || "Conductor",
      distanceKm,
      precioPasajeroMXN,
    };
  });

  return { candidatos };
}

export type UnirmeState = { error?: string; success?: boolean };

// Colapsa en un solo paso lo que antes eran dos (publicar oferta propia en
// /reserva + confirmar candidato en /consultar): elegir una tarjeta del feed
// crea la trip_offer del pasajero Y la marca como confirmada
// (passenger_confirmed = true) en la misma acción -- el conductor sigue
// confirmando desde /consultar como siempre (ver elegirCandidato en
// lib/actions/consultar.ts, sin cambios).
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
    .select("id, direction, role, status, scheduled_time")
    .eq("id", driverOfferId)
    .single();

  if (
    !ofertaConductor ||
    ofertaConductor.role !== "conductor" ||
    ofertaConductor.status !== "buscando"
  ) {
    return { error: "Ese viaje ya no está disponible. Actualiza la página." };
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
      scheduled_time: ofertaConductor.scheduled_time,
      uses_toll_roads: null,
      meeting_point: null,
    })
    .select("id")
    .single();

  if (errorInsert || !ofertaPasajero) {
    return { error: `No se pudo unir al viaje: ${errorInsert?.message ?? "error desconocido"}` };
  }

  const { data: distanciaMetros } = await admin.rpc("distance_between_offers", {
    p_offer_id_1: driverOfferId,
    p_offer_id_2: ofertaPasajero.id,
  });

  const duracionEstimada = Math.max(
    1,
    Math.round((Number(distanciaMetros ?? 0) / 1000 / VELOCIDAD_PROMEDIO_KMH) * 60)
  );

  // trip_matches no tiene policy de insert para el rol authenticated (solo
  // select/update, ver 0001_init_schema.sql) -- por diseño, solo el
  // servidor con la llave de servicio puede crear matches.
  const { error: errorMatch } = await admin.from("trip_matches").insert({
    driver_offer_id: driverOfferId,
    passenger_offer_id: ofertaPasajero.id,
    estimated_duration_minutes: duracionEstimada,
    passenger_confirmed: true,
  });

  if (errorMatch) {
    return {
      error: `Te uniste al viaje pero no se pudo registrar la confirmación: ${errorMatch.message}`,
    };
  }

  revalidatePath("/home");
  revalidatePath("/consultar");
  return { success: true };
}
