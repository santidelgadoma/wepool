import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import {
  CONDUCTOR,
  PASAJERO,
  CONDUCTOR_FEED_A,
  CONDUCTOR_FEED_B,
  PASAJERO_FEED,
  CONDUCTOR_RECHAZO_A,
  CONDUCTOR_RECHAZO_B,
  PASAJERO_RECHAZO,
  CONDUCTOR_CANCELA_SOLO,
  CONDUCTOR_CANCELA_PENDIENTE,
  PASAJERO_CANCELADO_POR_CONDUCTOR,
  CONDUCTOR_ESPERA_CANCELACION,
  PASAJERO_CANCELA_PROPIA,
  CONDUCTOR_REGRESO,
  PASAJERO_REGRESO,
  CONDUCTOR_REGRESO_INVALIDO,
  CONDUCTOR_CHAT,
  PASAJERO_CHAT,
  CONDUCTOR_CHAT_2,
  PASAJERO_CHAT_2,
  USUARIO_AJENO_CHAT,
  CONDUCTOR_RATE,
  PASAJERO_RATE,
  CONDUCTOR_RATE_NOSHOW,
  PASAJERO_RATE_NOSHOW,
  CONDUCTOR_RATE_COLUSION,
  PASAJERO_RATE_COLUSION,
  TEST_PASSWORD,
} from "./test-users";

type Persona = { email: string; fullName: string; phone: string };

// Se corre una sola vez antes de toda la suite (ver playwright.config.ts).
// Usa la llave de servicio de Supabase para:
//   1. Crear (o reusar) los dos usuarios de prueba, ya confirmados — así el
//      test no depende de recibir un correo real con el link mágico.
//   2. Limpiar cualquier trip_offers / vehicles / confirmed_trips que hayan
//      quedado de una corrida anterior, para que el test sea repetible.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL en
// .env.local (cargadas a mano por playwright.config.ts).
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local — " +
        "son necesarios para crear los usuarios de prueba de e2e/global-setup.ts."
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Mismo fix que lib/supabase/admin.ts: sin esto, createClient truena en
    // Node < 22 con "native WebSocket not found" (ver PROGRESS.md).
    realtime: { transport: WebSocket as never },
  });

  const personas = [
    CONDUCTOR,
    PASAJERO,
    CONDUCTOR_FEED_A,
    CONDUCTOR_FEED_B,
    PASAJERO_FEED,
    CONDUCTOR_RECHAZO_A,
    CONDUCTOR_RECHAZO_B,
    PASAJERO_RECHAZO,
    CONDUCTOR_CANCELA_SOLO,
    CONDUCTOR_CANCELA_PENDIENTE,
    PASAJERO_CANCELADO_POR_CONDUCTOR,
    CONDUCTOR_ESPERA_CANCELACION,
    PASAJERO_CANCELA_PROPIA,
    CONDUCTOR_REGRESO,
    PASAJERO_REGRESO,
    CONDUCTOR_REGRESO_INVALIDO,
    CONDUCTOR_CHAT,
    PASAJERO_CHAT,
    CONDUCTOR_CHAT_2,
    PASAJERO_CHAT_2,
    USUARIO_AJENO_CHAT,
    CONDUCTOR_RATE,
    PASAJERO_RATE,
    CONDUCTOR_RATE_NOSHOW,
    PASAJERO_RATE_NOSHOW,
    CONDUCTOR_RATE_COLUSION,
    PASAJERO_RATE_COLUSION,
  ];
  for (const persona of personas) {
    const userId = await asegurarUsuarioDePrueba(admin, persona);
    await limpiarDatosDePrueba(admin, userId);
  }
}

async function asegurarUsuarioDePrueba(
  admin: SupabaseClient,
  persona: Persona
): Promise<string> {
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email: persona.email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: persona.fullName, phone: persona.phone },
  });

  if (!errorCrear && creado.user) {
    return creado.user.id;
  }

  // Ya existía de una corrida anterior — lo buscamos por correo en vez de
  // fallar (createUser regresa error si el correo ya está registrado).
  const { data: listado, error: errorListar } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (errorListar) {
    throw new Error(`No se pudo crear ni encontrar ${persona.email}: ${errorListar.message}`);
  }
  const existente = listado.users.find((u) => u.email === persona.email);
  if (!existente) {
    throw new Error(
      `No se pudo crear ni encontrar ${persona.email}: ${errorCrear?.message ?? "error desconocido"}`
    );
  }
  return existente.id;
}

async function limpiarDatosDePrueba(admin: SupabaseClient, userId: string) {
  await admin
    .from("confirmed_trips")
    .delete()
    .or(`driver_id.eq.${userId},passenger_id.eq.${userId}`);
  await admin.from("trip_offers").delete().eq("user_id", userId);
  await admin.from("vehicles").delete().eq("owner_id", userId);
  // e2e/feed-flow.spec.ts guarda una ubicación ("casa") vía el formulario del
  // home -- se limpia aquí también para que cada corrida arranque sin una
  // ubicación guardada de una corrida anterior (aunque guardarUbicacion hace
  // upsert por (user_id, kind), así que en la práctica esto es más bien
  // higiene que una necesidad estricta).
  await admin.from("saved_locations").delete().eq("user_id", userId);
  // trip_ratings cuelga de confirmed_trips con `on delete cascade` (ver
  // supabase/migrations/0011_calificaciones.sql), así que el delete de
  // arriba ya se lleva también cualquier calificación de una corrida
  // anterior -- PERO el trigger que recalcula profiles.rating_avg/
  // rating_count solo dispara en insert/update de trip_ratings, nunca en
  // delete, así que el cascade NO reinicia esas dos columnas por sí solo.
  // Sin este reset explícito, e2e/calificaciones-flow.spec.ts (CU-RATE-04)
  // fallaría en la SEGUNDA corrida en adelante: el conductor de la prueba de
  // "no se realizó" ya tendría un rating_avg/rating_count "sucio" de la
  // corrida anterior, y la prueba no podría distinguir "no afecta el
  // promedio" de "el promedio no se leyó bien".
  await admin.from("profiles").update({ rating_avg: null, rating_count: 0 }).eq("id", userId);
}
