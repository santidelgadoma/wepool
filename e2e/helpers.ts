import { type Page, expect } from "@playwright/test";
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
