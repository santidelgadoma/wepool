// scripts/seed.ts
//
// Datos de ejemplo para la demo de inversionistas — usando al ITAM como
// primer cliente/piloto (ver PROGRESS.md, "Modelo de negocio / pitch": el
// ITAM es también un posible inversionista/cliente, así que la demo debe
// verse como una comunidad ITAM real, no como datos genéricos de prueba).
//
// Crea 8 usuarios @itam.mx (nombres y direcciones de zonas reales de CDMX),
// 4 vehículos, y 4 parejas conductor/pasajero:
//   - 2 parejas YA CONFIRMADAS (aparecen de inmediato en /manana e
//     /historial, sin tener que hacer clic en nada durante la demo).
//   - 2 parejas EN BÚSQUEDA, sin emparejar todavía (para poder mostrar en
//     vivo el algoritmo de emparejamiento y el flujo de confirmación en
//     /consultar frente al inversionista).
//
// REQUIERE que la migración supabase/migrations/0004_instituciones.sql ya
// esté aplicada en el proyecto real (crea la tabla `institutions`) — el
// script falla con un mensaje claro si no la encuentra.
//
// Los viajes son siempre "para mañana" (regla de negocio de la app), así
// que este script se debe correr el día antes de cada demo, no con
// semanas de anticipación — la fecha se calcula en el momento en que se
// corre, igual que lo valida la propia app.
//
// Uso:
//   npm run seed

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";

// ─── Config / env ───────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const linea of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    const valor = limpia.slice(igual + 1).trim();
    if (clave && !(clave in process.env)) process.env[clave] = valor;
  }
}

loadEnvLocal();

const SEED_PASSWORD = "CarpoolDemoITAM!2026";

// ─── Fecha/hora "mañana" en CDMX (misma regla que lib/datetime.ts y que la
// app valida en lib/actions/reserva.ts — se duplica aquí en vez de
// importarla para que el script no dependa de que tsx resuelva el alias
// "@/*" del proyecto). México no observa horario de verano desde 2022, así
// que el offset fijo -6 es seguro.

function fechaDeMananaCDMX(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  const hoyUTC = new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
  hoyUTC.setUTCDate(hoyUTC.getUTCDate() + 1);
  return hoyUTC.toISOString().slice(0, 10);
}

function horaMananaISO(hora: string): string {
  return new Date(`${fechaDeMananaCDMX()}T${hora}:00-06:00`).toISOString();
}

// ─── Personas de ejemplo ────────────────────────────────────────────────
// Zonas reales de CDMX donde suele vivir la comunidad del ITAM (el campus
// Río Hondo está en Álvaro Obregón, junto al corredor Santa Fe). Las
// coordenadas son aproximadas pero reales — suficiente para que el
// pre-filtro geoespacial (ST_DWithin) encuentre candidatos de verdad.

type PersonaSeed = {
  nombre: string;
  email: string;
  telefono: string;
};

type OfertaSeed = {
  persona: PersonaSeed;
  role: "conductor" | "pasajero";
  direction: "ida" | "regreso";
  homeAddress: string;
  lat: number;
  lng: number;
  hora: string; // "HH:MM" hora CDMX
  vehiculo?: { plate: string; description: string };
  usesTollRoads?: boolean;
  meetingPoint?: string;
};

const ANDREA: PersonaSeed = { nombre: "Andrea Torres Medina", email: "atorres@itam.mx", telefono: "5511220001" };
const DIEGO: PersonaSeed = { nombre: "Diego Ramírez Soto", email: "dramirez@itam.mx", telefono: "5511220002" };
const FERNANDA: PersonaSeed = { nombre: "Fernanda López Castillo", email: "flopez@itam.mx", telefono: "5511220003" };
const MAURICIO: PersonaSeed = { nombre: "Mauricio Hernández Ruiz", email: "mhernandez@itam.mx", telefono: "5511220004" };
const VALENTINA: PersonaSeed = { nombre: "Valentina Cruz Navarro", email: "vcruz@itam.mx", telefono: "5511220005" };
const EMILIO: PersonaSeed = { nombre: "Emilio Vargas Rosales", email: "evargas@itam.mx", telefono: "5511220006" };
const XIMENA: PersonaSeed = { nombre: "Ximena Morales Ibarra", email: "xmorales@itam.mx", telefono: "5511220007" };
const SEBASTIAN: PersonaSeed = { nombre: "Sebastián Ortiz Delgado", email: "sortiz@itam.mx", telefono: "5511220008" };

// Pareja A — ida, Santa Fe — se deja YA CONFIRMADA
const OFERTA_A_CONDUCTOR: OfertaSeed = {
  persona: ANDREA,
  role: "conductor",
  direction: "ida",
  homeAddress: "Av. Santa Fe 482, Col. Santa Fe, CDMX",
  lat: 19.3608,
  lng: -99.2643,
  hora: "07:30",
  vehiculo: { plate: "ABC-123-A", description: "Nissan Versa gris" },
  usesTollRoads: false,
};
const OFERTA_A_PASAJERO: OfertaSeed = {
  persona: DIEGO,
  role: "pasajero",
  direction: "ida",
  homeAddress: "Av. Vasco de Quiroga 3900, Col. Santa Fe, CDMX",
  lat: 19.3625,
  lng: -99.268,
  hora: "07:45",
};

// Pareja B — regreso, Interlomas — se deja YA CONFIRMADA
const OFERTA_B_CONDUCTOR: OfertaSeed = {
  persona: FERNANDA,
  role: "conductor",
  direction: "regreso",
  homeAddress: "Blvd. Magnocentro 26, Interlomas, Edo. Méx.",
  lat: 19.3945,
  lng: -99.2661,
  hora: "18:00",
  vehiculo: { plate: "DEF-456-B", description: "Mazda 3 blanco" },
  usesTollRoads: true,
  meetingPoint: "Estacionamiento principal, ITAM",
};
const OFERTA_B_PASAJERO: OfertaSeed = {
  persona: MAURICIO,
  role: "pasajero",
  direction: "regreso",
  homeAddress: "Blvd. de la Luz 100, Interlomas, Edo. Méx.",
  lat: 19.397,
  lng: -99.269,
  hora: "18:15",
};

// Pareja C — ida, Del Valle — se deja EN BÚSQUEDA (para emparejar en vivo)
const OFERTA_C_CONDUCTOR: OfertaSeed = {
  persona: VALENTINA,
  role: "conductor",
  direction: "ida",
  homeAddress: "Av. Coyoacán 1450, Col. Del Valle, CDMX",
  lat: 19.382,
  lng: -99.168,
  hora: "08:00",
  vehiculo: { plate: "GHI-789-C", description: "VW Jetta rojo" },
  usesTollRoads: false,
};
const OFERTA_C_PASAJERO: OfertaSeed = {
  persona: EMILIO,
  role: "pasajero",
  direction: "ida",
  homeAddress: "Av. Universidad 800, Col. Narvarte, CDMX",
  lat: 19.387,
  lng: -99.159,
  hora: "08:10",
};

// Pareja D — regreso, Coyoacán/San Ángel — se deja EN BÚSQUEDA
const OFERTA_D_CONDUCTOR: OfertaSeed = {
  persona: XIMENA,
  role: "conductor",
  direction: "regreso",
  homeAddress: "Av. Universidad 1330, Coyoacán, CDMX",
  lat: 19.3467,
  lng: -99.1618,
  hora: "17:30",
  vehiculo: { plate: "JKL-012-D", description: "Chevrolet Aveo azul" },
  usesTollRoads: false,
  meetingPoint: "Explanada principal, ITAM",
};
const OFERTA_D_PASAJERO: OfertaSeed = {
  persona: SEBASTIAN,
  role: "pasajero",
  direction: "regreso",
  homeAddress: "Calle Miguel Ángel de Quevedo 21, Coyoacán, CDMX",
  lat: 19.3455,
  lng: -99.179,
  hora: "17:45",
};

// ─── Helpers de base de datos ───────────────────────────────────────────

async function ensureUsuario(admin: SupabaseClient, persona: PersonaSeed): Promise<string> {
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email: persona.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: persona.nombre, phone: persona.telefono },
  });

  if (!errorCrear && creado.user) {
    return creado.user.id;
  }

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

async function limpiarDatosPrevios(admin: SupabaseClient, userIds: string[]) {
  const filtro = `driver_id.in.(${userIds.join(",")}),passenger_id.in.(${userIds.join(",")})`;
  await admin.from("confirmed_trips").delete().or(filtro);
  await admin.from("trip_offers").delete().in("user_id", userIds);
  await admin.from("vehicles").delete().in("owner_id", userIds);
}

async function crearVehiculo(
  admin: SupabaseClient,
  ownerId: string,
  vehiculo: { plate: string; description: string }
): Promise<string> {
  const { data, error } = await admin
    .from("vehicles")
    .insert({ owner_id: ownerId, plate: vehiculo.plate, description: vehiculo.description })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear el vehículo ${vehiculo.plate}: ${error?.message}`);
  return data.id as string;
}

async function crearOferta(
  admin: SupabaseClient,
  userId: string,
  oferta: OfertaSeed,
  vehicleId: string | null
): Promise<string> {
  const { data, error } = await admin
    .from("trip_offers")
    .insert({
      user_id: userId,
      direction: oferta.direction,
      role: oferta.role,
      vehicle_id: oferta.role === "conductor" ? vehicleId : null,
      home_address: oferta.homeAddress,
      home_location: `POINT(${oferta.lng} ${oferta.lat})`,
      scheduled_time: horaMananaISO(oferta.hora),
      uses_toll_roads: oferta.role === "conductor" ? oferta.usesTollRoads ?? false : null,
      meeting_point: oferta.role === "conductor" && oferta.direction === "regreso" ? oferta.meetingPoint : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear la oferta de ${oferta.persona.email}: ${error?.message}`);
  return data.id as string;
}

// Replica lo que hace lib/actions/consultar.ts -> elegirCandidato, pero de
// una sola vez para dejar una pareja ya confirmada en la demo, sin tener
// que pasar por el flujo de clics.
async function confirmarPareja(
  admin: SupabaseClient,
  ofertaConductorId: string,
  ofertaPasajeroId: string,
  conductor: { userId: string; oferta: OfertaSeed; vehicleId: string },
  pasajero: { userId: string; oferta: OfertaSeed }
) {
  const { data: distanciaMetros } = await admin.rpc("distance_between_offers", {
    p_offer_id_1: ofertaConductorId,
    p_offer_id_2: ofertaPasajeroId,
  });
  const VELOCIDAD_PROMEDIO_KMH = 22;
  const duracionEstimada = Math.max(
    1,
    Math.round((Number(distanciaMetros ?? 0) / 1000 / VELOCIDAD_PROMEDIO_KMH) * 60)
  );

  const { data: match, error: errorMatch } = await admin
    .from("trip_matches")
    .insert({
      driver_offer_id: ofertaConductorId,
      passenger_offer_id: ofertaPasajeroId,
      estimated_duration_minutes: duracionEstimada,
      passenger_confirmed: true,
    })
    .select("id")
    .single();
  if (errorMatch || !match) throw new Error(`No se pudo crear el match confirmado: ${errorMatch?.message}`);

  const { error: errorConfirmado } = await admin.from("confirmed_trips").insert({
    match_id: match.id,
    driver_id: conductor.userId,
    passenger_id: pasajero.userId,
    direction: conductor.oferta.direction,
    vehicle_id: conductor.vehicleId,
    home_address: pasajero.oferta.homeAddress,
    scheduled_time: horaMananaISO(conductor.oferta.hora),
    meeting_point: conductor.oferta.meetingPoint ?? null,
  });
  if (errorConfirmado) throw new Error(`No se pudo crear confirmed_trips: ${errorConfirmado.message}`);

  const { error: errorStatus } = await admin
    .from("trip_offers")
    .update({ status: "confirmado" })
    .in("id", [ofertaConductorId, ofertaPasajeroId]);
  if (errorStatus) throw new Error(`No se pudo actualizar status de ofertas: ${errorStatus.message}`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local."
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as never },
  });

  const { error: errorInstitucion, data: institucion } = await admin
    .from("institutions")
    .select("id")
    .eq("email_domain", "itam.mx")
    .maybeSingle();

  if (errorInstitucion || !institucion) {
    throw new Error(
      "No se encontró la institución ITAM en la tabla `institutions`. " +
        "Aplica primero supabase/migrations/0004_instituciones.sql en el proyecto real."
    );
  }

  console.log(`Fecha de "mañana" para este seed: ${fechaDeMananaCDMX()}`);

  const todasLasPersonas = [ANDREA, DIEGO, FERNANDA, MAURICIO, VALENTINA, EMILIO, XIMENA, SEBASTIAN];
  const idPorEmail = new Map<string, string>();

  for (const persona of todasLasPersonas) {
    const id = await ensureUsuario(admin, persona);
    idPorEmail.set(persona.email, id);
    console.log(`Usuario listo: ${persona.nombre} <${persona.email}>`);
  }

  await limpiarDatosPrevios(admin, Array.from(idPorEmail.values()));
  console.log("Datos de viajes/vehículos anteriores de estos usuarios, limpiados.");

  async function crearParConVehiculo(conductorSeed: OfertaSeed, pasajeroSeed: OfertaSeed) {
    const conductorId = idPorEmail.get(conductorSeed.persona.email)!;
    const pasajeroId = idPorEmail.get(pasajeroSeed.persona.email)!;
    const vehicleId = await crearVehiculo(admin, conductorId, conductorSeed.vehiculo!);
    const ofertaConductorId = await crearOferta(admin, conductorId, conductorSeed, vehicleId);
    const ofertaPasajeroId = await crearOferta(admin, pasajeroId, pasajeroSeed, null);
    return { conductorId, pasajeroId, vehicleId, ofertaConductorId, ofertaPasajeroId };
  }

  const parA = await crearParConVehiculo(OFERTA_A_CONDUCTOR, OFERTA_A_PASAJERO);
  await confirmarPareja(
    admin,
    parA.ofertaConductorId,
    parA.ofertaPasajeroId,
    { userId: parA.conductorId, oferta: OFERTA_A_CONDUCTOR, vehicleId: parA.vehicleId },
    { userId: parA.pasajeroId, oferta: OFERTA_A_PASAJERO }
  );
  console.log("Pareja A (Andrea + Diego, ida Santa Fe) confirmada.");

  const parB = await crearParConVehiculo(OFERTA_B_CONDUCTOR, OFERTA_B_PASAJERO);
  await confirmarPareja(
    admin,
    parB.ofertaConductorId,
    parB.ofertaPasajeroId,
    { userId: parB.conductorId, oferta: OFERTA_B_CONDUCTOR, vehicleId: parB.vehicleId },
    { userId: parB.pasajeroId, oferta: OFERTA_B_PASAJERO }
  );
  console.log("Pareja B (Fernanda + Mauricio, regreso Interlomas) confirmada.");

  await crearParConVehiculo(OFERTA_C_CONDUCTOR, OFERTA_C_PASAJERO);
  console.log("Pareja C (Valentina + Emilio, ida Del Valle) creada — sin emparejar, lista para /consultar.");

  await crearParConVehiculo(OFERTA_D_CONDUCTOR, OFERTA_D_PASAJERO);
  console.log("Pareja D (Ximena + Sebastián, regreso Coyoacán) creada — sin emparejar, lista para /consultar.");

  console.log("\nListo. Contraseña de todos los usuarios de demo:", SEED_PASSWORD);
  console.log(
    "Inicia sesión con cualquiera de los 8 correos @itam.mx de arriba para recorrer la demo."
  );
}

main().catch((err) => {
  console.error("\nEl seed falló:", err);
  process.exit(1);
});
