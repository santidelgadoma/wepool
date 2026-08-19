// scripts/seed-cuajimalpa.ts
//
// Crea 4 ofertas de CONDUCTOR (solo conductor, sin pasajero emparejado) de
// ida hacia el ITAM, desde direcciones reales de Cuajimalpa de Morelos —
// pensado para poder entrar con tu propia cuenta (o cualquier cuenta
// @itam.mx) y ver el feed del home poblado desde la perspectiva de un
// pasajero, sin tener que correr el seed completo de la demo de
// inversionistas (scripts/seed.ts, que además deja parejas YA confirmadas).
//
// A diferencia de scripts/seed.ts, este script:
//   - Solo crea conductores (4), ningún pasajero ni match — así el feed del
//     home los muestra tal cual los mostraría un conductor real que apenas
//     publicó su salida.
//   - Es independiente y re-corrible: solo limpia/toca los 4 usuarios que
//     él mismo crea, nunca los del seed principal.
//
// REQUIERE que las migraciones 0004 (institutions), 0006 (saved_locations,
// no la usa este script pero sí la pantalla /home) y 0007 (home_lat/lng en
// trip_offers) ya estén aplicadas en el proyecto real — falla con un
// mensaje claro si no encuentra la institución ITAM; si 0007 no está
// aplicada, la inserción falla por la columna home_lat/home_lng, que ya es
// NOT NULL.
//
// Los viajes son siempre "para mañana" (regla de negocio de la app), así
// que este script se debe correr el día antes de querer verlos en el feed.
//
// Uso:
//   npm run seed:cuajimalpa
//
// Después de correrlo: entra con tu cuenta @itam.mx, en el home agrega o
// elige una ubicación guardada (Casa/Oficina/Otro) con una dirección cerca
// de Cuajimalpa/Santa Fe, y deberías ver las 4 tarjetas en el feed.

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";

// ─── Config / env (idéntico a scripts/seed.ts) ─────────────────────────────

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

// ─── Fecha/hora "mañana" en CDMX (misma regla que lib/datetime.ts, se
// duplica aquí como ya hace scripts/seed.ts para no depender del alias
// "@/*" del proyecto en un script suelto). México no observa horario de
// verano desde 2022, así que el offset fijo -6 es seguro.

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

// ─── Conductores de ejemplo — Cuajimalpa de Morelos ────────────────────────
// Direcciones reales de distintas colonias de la alcaldía (centro, El
// Contadero, San Pablo Chimalpa, Bosques de las Lomas) para que se vean
// repartidas en el mapa y no todas pegadas al mismo punto. Coordenadas
// aproximadas pero reales -- las cuatro caen dentro de los 15km de radio
// que usa find_driver_offers_near (RADIO_KM en lib/actions/feed.ts) medidos
// desde el campus del ITAM (19.3443468, -99.199729, ver
// 0005_campus_institucion.sql), con margen de sobra.

type ConductorSeed = {
  nombre: string;
  email: string;
  telefono: string;
  homeAddress: string;
  lat: number;
  lng: number;
  hora: string; // "HH:MM" hora CDMX
  vehiculo: { plate: string; description: string };
  usesTollRoads: boolean;
};

const CONDUCTORES: ConductorSeed[] = [
  {
    nombre: "Rodrigo Peña Aguilar",
    email: "rpena@itam.mx",
    telefono: "5511230001",
    homeAddress: "Av. Juárez 100, Pueblo de Cuajimalpa, Cuajimalpa de Morelos, CDMX",
    lat: 19.357,
    lng: -99.293,
    hora: "07:00",
    vehiculo: { plate: "CUA-001-A", description: "Honda CR-V gris" },
    usesTollRoads: false,
  },
  {
    nombre: "Camila Solís Fernández",
    email: "csolis@itam.mx",
    telefono: "5511230002",
    homeAddress: "Av. Veracruz 50, El Contadero, Cuajimalpa de Morelos, CDMX",
    lat: 19.349,
    lng: -99.284,
    hora: "07:20",
    vehiculo: { plate: "CUA-002-B", description: "Kia Rio blanco" },
    usesTollRoads: true,
  },
  {
    nombre: "Alejandro Duarte Mendoza",
    email: "aduarte@itam.mx",
    telefono: "5511230003",
    homeAddress: "Camino a Santa Rosa 200, San Pablo Chimalpa, Cuajimalpa de Morelos, CDMX",
    lat: 19.366,
    lng: -99.307,
    hora: "07:45",
    vehiculo: { plate: "CUA-003-C", description: "Toyota RAV4 negra" },
    usesTollRoads: true,
  },
  {
    nombre: "Paulina Reyes Cordero",
    email: "preyes@itam.mx",
    telefono: "5511230004",
    homeAddress: "Bosque de Ciruelos 130, Bosques de las Lomas, Cuajimalpa de Morelos, CDMX",
    lat: 19.386,
    lng: -99.254,
    hora: "08:15",
    vehiculo: { plate: "CUA-004-D", description: "Mazda CX-5 azul" },
    usesTollRoads: false,
  },
];

// ─── Helpers de base de datos (mismo patrón que scripts/seed.ts) ──────────

async function ensureUsuario(admin: SupabaseClient, conductor: ConductorSeed): Promise<string> {
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email: conductor.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: conductor.nombre, phone: conductor.telefono },
  });

  if (!errorCrear && creado.user) {
    return creado.user.id;
  }

  const { data: listado, error: errorListar } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (errorListar) {
    throw new Error(`No se pudo crear ni encontrar ${conductor.email}: ${errorListar.message}`);
  }
  const existente = listado.users.find((u) => u.email === conductor.email);
  if (!existente) {
    throw new Error(
      `No se pudo crear ni encontrar ${conductor.email}: ${errorCrear?.message ?? "error desconocido"}`
    );
  }
  return existente.id;
}

async function limpiarDatosPrevios(admin: SupabaseClient, userIds: string[]) {
  // Solo toca lo que pertenece a los 4 usuarios de ESTE script -- nunca los
  // del seed principal (scripts/seed.ts) ni cuentas reales de nadie más.
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
  if (error || !data) {
    throw new Error(`No se pudo crear el vehículo ${vehiculo.plate}: ${error?.message}`);
  }
  return data.id as string;
}

async function crearOfertaConductor(
  admin: SupabaseClient,
  userId: string,
  vehicleId: string,
  conductor: ConductorSeed
) {
  const { error } = await admin.from("trip_offers").insert({
    user_id: userId,
    direction: "ida",
    role: "conductor",
    vehicle_id: vehicleId,
    home_address: conductor.homeAddress,
    home_location: `POINT(${conductor.lng} ${conductor.lat})`,
    // home_lat/home_lng planos, requeridos desde 0007_rutas_reales.sql --
    // ver lib/rutas.ts, que los necesita para llamar a Google Routes API.
    home_lat: conductor.lat,
    home_lng: conductor.lng,
    scheduled_time: horaMananaISO(conductor.hora),
    uses_toll_roads: conductor.usesTollRoads,
    // meeting_point solo es obligatorio para conductor + regreso (ver
    // constraint driver_regreso_requires_meeting_point en
    // 0001_init_schema.sql) -- estos 4 son todos de ida, así que se deja null.
    meeting_point: null,
  });
  if (error) {
    throw new Error(`No se pudo crear la oferta de ${conductor.email}: ${error.message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
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

  const idPorEmail = new Map<string, string>();
  for (const conductor of CONDUCTORES) {
    const id = await ensureUsuario(admin, conductor);
    idPorEmail.set(conductor.email, id);
    console.log(`Conductor listo: ${conductor.nombre} <${conductor.email}>`);
  }

  await limpiarDatosPrevios(admin, Array.from(idPorEmail.values()));
  console.log("Ofertas/vehículos anteriores de estos 4 conductores, limpiados.");

  for (const conductor of CONDUCTORES) {
    const userId = idPorEmail.get(conductor.email)!;
    const vehicleId = await crearVehiculo(admin, userId, conductor.vehiculo);
    await crearOfertaConductor(admin, userId, vehicleId, conductor);
    console.log(
      `Oferta publicada: ${conductor.nombre} -- ida desde "${conductor.homeAddress}" a las ${conductor.hora}.`
    );
  }

  console.log(
    "\nListo. Se crearon 4 conductores de Cuajimalpa (ida al ITAM), sin ningún pasajero " +
      "emparejado todavía -- van a aparecer como tarjetas nuevas en el feed."
  );
  console.log("Contraseña de estos 4 usuarios de prueba (por si quieres entrar como uno de ellos):", SEED_PASSWORD);
  console.log(
    "\nPara verlos desde la perspectiva de un pasajero: entra con tu propia cuenta @itam.mx " +
      "(o cualquier otra), ve al home, y agrega o elige una ubicación guardada (Casa/Oficina/Otro) " +
      "con una dirección cerca de Cuajimalpa o Santa Fe -- las 4 tarjetas deberían aparecer en el feed."
  );
}

main().catch((err) => {
  console.error("\nEl seed de Cuajimalpa falló:", err);
  process.exit(1);
});
