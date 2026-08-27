import { type Page, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import { TEST_PASSWORD } from "./test-users";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.locator("#login-submit").click();
  // 30s en vez de 15s: en modo `next dev` la primera visita a una ruta la
  // compila sobre la marcha, y /home + su layout ((app)/layout.tsx, que
  // ahora hace una consulta extra a `profiles` para el nombre de la
  // institución) pueden tardar más que 15s en compilar la primerísima vez
  // después de editar código — no es que el login realmente falle, es que
  // el timeout se quedaba corto. Mismo margen generoso que ya se usa abajo
  // para "¡Viaje publicado!".
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
}

export type DatosViaje = {
  role: "conductor" | "pasajero";
  direction: "ida" | "regreso";
  homeAddress: string;
  hora?: string;
  vehiculo?: { placas: string; descripcion: string };
  usaCuota?: boolean;
  meetingPoint?: string;
};

export async function publicarViaje(page: Page, datos: DatosViaje) {
  await page.goto("/reserva");

  // Los toggles de rol/dirección/cuota tienen id fijo (id={`role-${opcion}`},
  // etc. — ver components/reserva-form.tsx) en vez de solo depender del
  // texto visible del botón: un cambio de copy ya no puede romper el test en
  // silencio, y localizar por id dice explícitamente qué opción se está
  // eligiendo.
  await page.locator(`#role-${datos.role}`).click();
  await page.locator(`#direction-${datos.direction}`).click();

  await page.locator("#homeAddress").fill(datos.homeAddress);
  // #scheduledTime ahora es <input type="time"> (antes era datetime-local
  // completo) — la fecha siempre es "mañana" y ya no se pide en el
  // formulario, el servidor la arma solo (ver lib/actions/reserva.ts). Solo
  // se llena la hora.
  await page.locator("#scheduledTime").fill(datos.hora ?? "08:00");

  if (datos.role === "conductor") {
    // Si el conductor ya tiene ≥1 vehículo registrado (p.ej. una segunda
    // oferta publicada por el mismo usuario dentro del mismo spec),
    // reserva-form.tsx arranca el <select> apuntando a ese vehículo
    // existente (`vehiculos[0]?.id ?? "nuevo"`) en vez de a "Registrar un
    // vehículo nuevo…", así que los inputs `newVehiclePlate`/
    // `newVehicleDescription` no se renderizan hasta elegir esa opción a
    // propósito. El helper siempre quiere registrar el vehículo que le
    // pasaron, así que fuerza esa opción cuando el selector existe.
    const vehicleSelect = page.locator("#vehicle-choice-select");
    if (await vehicleSelect.count()) {
      await vehicleSelect.selectOption("nuevo");
    }
    await page.locator('input[name="newVehiclePlate"]').fill(datos.vehiculo?.placas ?? "E2E-001");
    await page
      .locator('input[name="newVehicleDescription"]')
      .fill(datos.vehiculo?.descripcion ?? "Auto de prueba E2E");
    await page.locator(`#toll-roads-${datos.usaCuota ? "true" : "false"}`).click();
    if (datos.direction === "regreso") {
      await page.locator("#meetingPoint").fill(datos.meetingPoint ?? "Estacionamiento principal");
    }
  }

  await page.locator("#publicar-viaje-submit").click();
  // crearOferta (lib/actions/reserva.ts) ya no se queda en /reserva
  // mostrando un mensaje de éxito -- ahora redirige a /home?publicado=1 en
  // cuanto termina, y HomePage muestra el aviso ahí (ver
  // components/publicado-banner.tsx). El submit dispara geocoding real
  // (Nominatim) desde el servidor antes del redirect — se le da margen
  // generoso antes de considerar que algo salió mal.
  await expect(page).toHaveURL(/\/home/, { timeout: 20_000 });
  await expect(page.locator("#publicado-banner")).toBeVisible({ timeout: 10_000 });
}

// Guarda la ubicación "casa" del pasajero desde el home (ver
// components/ubicacion-form.tsx) -- es lo que hace que obtenerFeed()
// (lib/actions/feed.ts) tenga desde dónde buscar viajes cercanos. Asume que
// la página ya está en /home con el formulario de ubicación visible (caso
// normal la primera vez: todavía no hay ninguna ubicación "casa" guardada,
// así que HomePage renderiza el formulario directo, sin el <details>
// "Cambiar dirección").
export async function guardarUbicacionCasa(page: Page, address: string) {
  await page.locator("#address-casa").fill(address);
  await page.locator("#guardar-ubicacion-casa").click();
  // guardarUbicacion hace geocoding real (Nominatim) igual que
  // publicarViaje — mismo margen generoso. El <form action={formAction}>
  // apunta a un Server Action, así que Next.js refresca solo los datos de la
  // ruta actual al terminar -- no hace falta un router.refresh() manual. La
  // señal de éxito es que HomePage deja de mostrar el formulario de "Agrega
  // tu dirección" y en su lugar muestra "Cerca de <dirección guardada>".
  await expect(page.getByText(`Cerca de ${address}`)).toBeVisible({ timeout: 20_000 });
}

// ─── Cliente admin para e2e/calificaciones-flow.spec.ts ────────────────────
// Mismo patrón que e2e/global-setup.ts y lib/supabase/admin.ts (llave de
// servicio -- salta RLS -- y `ws` como transporte porque @supabase/supabase-js
// crea un RealtimeClient interno que exige WebSocket nativo en Node < 22).
// playwright.config.ts ya carga .env.local a mano antes de correr cualquier
// test, así que SUPABASE_SERVICE_ROLE_KEY está disponible aquí igual que en
// global-setup.ts, sin configuración adicional.
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket as never },
    }
  );
}

// Fuerza confirmed_trips.status = 'completado' para un viaje de prueba sin
// esperar los 15 minutos del cron real (complete_past_confirmed_trips, ver
// supabase/migrations/0011_calificaciones.sql) -- opción (a), la recomendada
// en el hallazgo E-8 de docs/casos_de_uso.md: usar el cliente admin para
// forzar el estado directo en vez de crear el viaje con scheduled_time en el
// pasado y esperar el cron de verdad (mucho más lento y menos confiable en
// un spec).
export async function completarViajeComoAdmin(confirmedTripId: string) {
  const admin = crearClienteAdmin();
  const { error } = await admin
    .from("confirmed_trips")
    .update({ status: "completado" })
    .eq("id", confirmedTripId);
  if (error) {
    throw new Error(
      `No se pudo forzar status='completado' en confirmed_trip ${confirmedTripId}: ${error.message}`
    );
  }
}
