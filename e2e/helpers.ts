import { type Page, expect } from "@playwright/test";
import { TEST_PASSWORD } from "./test-users";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
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

  await page
    .getByRole("button", { name: datos.role === "conductor" ? "Conductor" : "Pasajero" })
    .click();
  await page
    .getByRole("button", { name: datos.direction === "ida" ? "Ida al ITAM" : "Regreso del ITAM" })
    .click();

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
    // El radio plano de "¿usas vías de cuota?" se volvió un toggle de
    // botones (mismo estilo que rol/dirección) — se elige por texto
    // accesible en vez de `.check()` sobre un input.
    await page
      .getByRole("button", { name: datos.usaCuota ? "Sí" : "No", exact: true })
      .click();
    if (datos.direction === "regreso") {
      await page.locator("#meetingPoint").fill(datos.meetingPoint ?? "Estacionamiento principal");
    }
  }

  await page.getByRole("button", { name: "Publicar viaje" }).click();
  // El submit dispara geocoding real (Nominatim) desde el servidor — se le
  // da margen generoso antes de considerar que algo salió mal.
  await expect(page.getByText("¡Viaje publicado!")).toBeVisible({ timeout: 20_000 });
}
