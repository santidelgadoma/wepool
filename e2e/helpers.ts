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

// Réplica intencional del algoritmo de lib/datetime.ts::fechaDeMananaCDMX —
// se duplica (en vez de importar la app desde e2e/) para que el test no
// dependa de que Playwright resuelva el alias "@/*" del proyecto, y para que
// quede claro que esta fecha debe coincidir exactamente con la que valida el
// servidor. México no observa horario de verano desde 2022, así que el
// offset fijo de -6 es seguro aquí igual que en la app.
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

export function horaDeMananaParaInput(hora = "08:00"): string {
  return `${fechaDeMananaCDMX()}T${hora}`;
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
  await page.locator("#scheduledTime").fill(horaDeMananaParaInput(datos.hora));

  if (datos.role === "conductor") {
    await page.locator('input[name="newVehiclePlate"]').fill(datos.vehiculo?.placas ?? "E2E-001");
    await page
      .locator('input[name="newVehicleDescription"]')
      .fill(datos.vehiculo?.descripcion ?? "Auto de prueba E2E");
    await page
      .locator(`input[name="usesTollRoads"][value="${datos.usaCuota ? "true" : "false"}"]`)
      .check();
    if (datos.direction === "regreso") {
      await page.locator("#meetingPoint").fill(datos.meetingPoint ?? "Estacionamiento principal");
    }
  }

  await page.getByRole("button", { name: "Publicar viaje" }).click();
  // El submit dispara geocoding real (Nominatim) desde el servidor — se le
  // da margen generoso antes de considerar que algo salió mal.
  await expect(page.getByText("¡Viaje publicado!")).toBeVisible({ timeout: 20_000 });
}
