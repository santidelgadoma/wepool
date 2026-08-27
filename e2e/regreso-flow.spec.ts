import { test, expect } from "@playwright/test";
import { CONDUCTOR_REGRESO, PASAJERO_REGRESO, CONDUCTOR_REGRESO_INVALIDO } from "./test-users";
import { login, publicarViaje } from "./helpers";

// CU-COND-03 y CU-COND-04 de docs/casos_de_uso.md: publicar un viaje de
// REGRESO (con punto de encuentro obligatorio para el conductor) -- hasta
// ahora ningún spec publicaba nunca `direction: "regreso"`, así que toda esa
// mitad del producto (el campo meeting_point, su validación, y que se
// muestre correctamente en /manana) no tenía cobertura.
//
// Direcciones en Av. Universidad (Ciudad Universitaria/Coyoacán) -- zona
// distinta a la que ya usan demo-flow/feed-flow/rechazo-flow (San
// Ángel/Insurgentes Sur) y cancelacion-flow (Insurgentes Norte), siguiendo la
// convención de CLAUDE.md. Como aquí se usa el camino MANUAL (/reserva +
// /consultar, con ventana de 30 min) y no el feed (que no filtra por hora),
// el riesgo real de contaminación entre specs es mucho menor -- aun así se
// usa una zona/hora propias por consistencia con el resto de la suite.
test("CU-COND-03: conductor publica un viaje de regreso con punto de encuentro y se confirma con un pasajero", async ({
  browser,
}) => {
  // 150s en vez de 120s: mismo motivo que feed-flow.spec.ts/rechazo-flow.spec.ts
  // (ver CLAUDE.md) -- la suite depende de red real (Supabase Auth,
  // geocoding de Nominatim) y 120s se quedó corto por poco en una corrida
  // real.
  test.setTimeout(150_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_REGRESO.email);
    await login(pasajeroPage, PASAJERO_REGRESO.email);

    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "regreso",
      homeAddress: "Avenida Universidad 1330, Ciudad de México",
      hora: "18:45",
      usaCuota: false,
      meetingPoint: "Explanada del edificio principal",
    });

    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "regreso",
      homeAddress: "Avenida Universidad 1400, Ciudad de México",
      hora: "18:45",
    });

    await pasajeroPage.goto("/consultar");
    const elegirComoPasajero = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegirComoPasajero).toBeVisible({ timeout: 20_000 });
    await elegirComoPasajero.click();
    // Ver e2e/demo-flow.spec.ts / CLAUDE.md: hay que esperar la señal de
    // éxito real del componente antes de navegar, nunca asumir que el click
    // ya terminó de escribir en la base de datos.
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await pasajeroPage.goto("/home");
    await expect(
      pasajeroPage.getByText(/elegiste un viaje de regreso.*esperando respuesta del conductor/i)
    ).toBeVisible({ timeout: 10_000 });

    await conductorPage.goto("/consultar");
    const aceptarComoConductor = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptarComoConductor).toBeVisible({ timeout: 20_000 });
    await aceptarComoConductor.click();
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    // El punto de encuentro debe verse en "mañana" para AMBOS lados (viene
    // del mismo confirmed_trips.meeting_point, ver
    // lib/actions/solicitudes.ts::responderSolicitudInterno), junto con el
    // rol y la dirección correctos.
    await conductorPage.goto("/manana");
    await expect(conductorPage.getByText("Conductor · Regreso")).toBeVisible();
    await expect(conductorPage.getByText("Explanada del edificio principal")).toBeVisible();

    await pasajeroPage.goto("/manana");
    await expect(pasajeroPage.getByText("Pasajero · Regreso")).toBeVisible();
    await expect(pasajeroPage.getByText("Explanada del edificio principal")).toBeVisible();
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});

test("CU-COND-04: publicar de regreso sin punto de encuentro real (solo espacios) lo rechaza el servidor", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await login(page, CONDUCTOR_REGRESO_INVALIDO.email);
  await page.goto("/reserva");

  await page.locator("#role-conductor").click();
  await page.locator("#direction-regreso").click();
  await page.locator("#homeAddress").fill("Avenida Universidad 1500, Ciudad de México");
  await page.locator("#scheduledTime").fill("19:00");
  await page.locator('input[name="newVehiclePlate"]').fill("E2E-REG");
  await page.locator('input[name="newVehicleDescription"]').fill("Auto de prueba E2E");
  await page.locator("#toll-roads-false").click();
  // #meetingPoint lleva el atributo HTML `required` (ver
  // components/reserva-form.tsx) -- un valor vacío nunca llegaría a
  // golpear la validación del SERVIDOR porque el navegador bloquearía el
  // submit antes. Un valor de solo espacios sí pasa la validación nativa
  // (length > 0) pero zod lo recorta a "" con `.trim()` antes de revisar
  // `superRefine` (lib/actions/reserva.ts) -- así se prueba la validación
  // real del servidor, no solo la nativa del navegador.
  await page.locator("#meetingPoint").fill("   ");

  await page.locator("#publicar-viaje-submit").click();

  await expect(
    page.getByText("Como conductor de regreso debes indicar un punto de encuentro en el campus.")
  ).toBeVisible({ timeout: 10_000 });
  // No publica: se queda en /reserva (sin redirect a /home) y no se crea
  // ninguna oferta.
  await expect(page).toHaveURL(/\/reserva/);

  await page.goto("/cancelar");
  await expect(page.getByText("No tienes reservaciones activas")).toBeVisible({
    timeout: 10_000,
  });
});
