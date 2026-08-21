import { test, expect } from "@playwright/test";
import {
  CONDUCTOR_CANCELA_SOLO,
  CONDUCTOR_CANCELA_PENDIENTE,
  PASAJERO_CANCELADO_POR_CONDUCTOR,
  CONDUCTOR_ESPERA_CANCELACION,
  PASAJERO_CANCELA_PROPIA,
} from "./test-users";
import { login, publicarViaje, guardarUbicacionCasa } from "./helpers";

// CU-COND-11, CU-COND-12, CU-PAS-14, CU-E2E-05 y CU-E2E-06 de
// docs/casos_de_uso.md: los tres caminos de cancelación que ningún otro spec
// prueba todavía (demo-flow/feed-flow/rechazo-flow solo prueban elegir,
// aceptar y rechazar -- nunca cancelar). Tres tests independientes en un solo
// archivo, cada uno con su propio par de usuarios dedicados (ver
// e2e/test-users.ts) para no compartir estado entre ellos.
//
// Direcciones deliberadamente en Av. Insurgentes NORTE (no Sur) -- lejos del
// tramo de Av. Insurgentes Sur/Revolución que ya usan demo-flow.spec.ts,
// feed-flow.spec.ts y rechazo-flow.spec.ts. Se encontró en esta misma sesión
// que obtenerFeed (lib/actions/feed.ts) no filtra por hora, solo por día y un
// radio de 15km -- así que una oferta de conductor que se queda 'buscando'
// sin que nadie la cancele al final de un spec puede colarse en el feed de
// CUALQUIER OTRO spec que publique dentro de esos 15km, sin importar qué
// usuarios de prueba use cada uno (fue justo lo que le pasó a
// rechazo-flow.spec.ts con el residuo de feed-flow.spec.ts). Por eso además
// cada test de aquí termina cancelando cualquier oferta de conductor que
// pudiera quedar viva.
test("CU-COND-11: conductor cancela una oferta propia en 'buscando' sin nadie esperando", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await login(page, CONDUCTOR_CANCELA_SOLO.email);
  await publicarViaje(page, {
    role: "conductor",
    direction: "ida",
    homeAddress: "Av. Insurgentes Norte 1000, Ciudad de México",
    hora: "09:00",
    usaCuota: false,
  });

  await page.goto("/cancelar");
  const cancelar = page.locator('button[id^="cancelar-"]');
  await expect(cancelar).toHaveCount(1, { timeout: 15_000 });
  await cancelar.first().click();
  // CancelarBoton no muestra ningún texto de éxito (a diferencia de
  // ElegirBoton/SolicitudCard) -- la señal de que cancelarOferta ya resolvió
  // es que la tarjeta desaparece de la lista tras el router.refresh().
  await expect(cancelar).toHaveCount(0, { timeout: 15_000 });

  // "ya no aparece en ningún feed/candidatos": /cancelar solo lista
  // 'buscando'/'pendiente' propias, así que si sigue en 0 tras recargar,
  // cancelarOferta sí borró la fila (no solo la ocultó).
  await page.reload();
  await expect(page.getByText("No tienes reservaciones activas")).toBeVisible({
    timeout: 10_000,
  });
});

test("CU-COND-12 / CU-E2E-05: conductor cancela una oferta 'pendiente' mientras el pasajero espera", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_CANCELA_PENDIENTE.email);
    await login(pasajeroPage, PASAJERO_CANCELADO_POR_CONDUCTOR.email);

    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Insurgentes Norte 1200, Ciudad de México",
      hora: "09:15",
      usaCuota: false,
    });

    await pasajeroPage.goto("/home");
    await guardarUbicacionCasa(pasajeroPage, "Av. Insurgentes Norte 1250, Ciudad de México");
    const botonUnirme = pasajeroPage.locator('button[id^="unirme-"]');
    await expect(botonUnirme).toHaveCount(1, { timeout: 30_000 });
    await botonUnirme.first().click();
    await expect(
      pasajeroPage.getByText("¡Te uniste! Esperando confirmación del conductor.")
    ).toBeVisible({ timeout: 10_000 });

    // El conductor, en vez de aceptar o rechazar desde el banner/consultar,
    // cancela directo desde /cancelar (CU-COND-12) -- la oferta trae el badge
    // "Esperando respuesta" porque está en 'pendiente', no en 'buscando'.
    await conductorPage.goto("/cancelar");
    await expect(conductorPage.getByText("Esperando respuesta")).toBeVisible({
      timeout: 15_000,
    });
    const cancelarConductor = conductorPage.locator('button[id^="cancelar-"]');
    await cancelarConductor.first().click();
    await expect(cancelarConductor).toHaveCount(0, { timeout: 15_000 });

    // Desde la perspectiva del pasajero, un conductor cancelando mientras
    // espera es indistinguible de un rechazo real (mismo aviso, ver
    // lib/actions/cancelar.ts) -- CU-E2E-05.
    await pasajeroPage.goto("/home");
    await expect(
      pasajeroPage.getByText("El conductor rechazó tu solicitud de ida.")
    ).toBeVisible({ timeout: 15_000 });

    // La oferta del conductor se BORRÓ (no volvió a 'buscando', a diferencia
    // de un rechazo real) -- como era el único conductor publicado en esta
    // zona, el feed debe quedar vacío.
    await expect(
      pasajeroPage.getByText("Todavía no hay viajes publicados cerca de aquí")
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});

test("CU-PAS-14 / CU-E2E-06: pasajero cancela su propia solicitud pendiente", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_ESPERA_CANCELACION.email);
    await login(pasajeroPage, PASAJERO_CANCELA_PROPIA.email);

    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Insurgentes Norte 1500, Ciudad de México",
      hora: "09:30",
      usaCuota: false,
    });

    await pasajeroPage.goto("/home");
    await guardarUbicacionCasa(pasajeroPage, "Av. Insurgentes Norte 1550, Ciudad de México");
    const botonUnirme = pasajeroPage.locator('button[id^="unirme-"]');
    await expect(botonUnirme).toHaveCount(1, { timeout: 30_000 });
    await botonUnirme.first().click();
    await expect(
      pasajeroPage.getByText("¡Te uniste! Esperando confirmación del conductor.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(botonUnirme).toHaveCount(0, { timeout: 15_000 });

    // El pasajero se arrepiente y cancela su propia solicitud desde
    // /cancelar mientras sigue 'pendiente' (badge "Esperando respuesta").
    await pasajeroPage.goto("/cancelar");
    await expect(pasajeroPage.getByText("Esperando respuesta")).toBeVisible({
      timeout: 15_000,
    });
    const cancelarPasajero = pasajeroPage.locator('button[id^="cancelar-"]');
    await cancelarPasajero.first().click();
    await expect(cancelarPasajero).toHaveCount(0, { timeout: 15_000 });

    // Al cancelar el PASAJERO (a diferencia del test anterior, donde cancela
    // el conductor), la oferta del conductor vuelve a 'buscando' SIN ningún
    // aviso especial -- no fue el conductor quien la rechazó (ver
    // lib/actions/cancelar.ts). El pasajero debe poder ver el mismo viaje de
    // nuevo en el feed, como si nunca lo hubiera elegido.
    await pasajeroPage.goto("/home");
    await expect(
      pasajeroPage.getByText("El conductor rechazó tu solicitud de ida.")
    ).not.toBeVisible();
    await expect(botonUnirme).toHaveCount(1, { timeout: 15_000 });

    // Limpieza: la oferta del conductor sigue 'buscando' al terminar el
    // test (nadie más la reclamó) -- se cancela para no dejarla viva en la
    // base de datos real y contaminar el feed de otro spec (ver el
    // comentario al principio de este archivo).
    await conductorPage.goto("/cancelar");
    const cancelarConductor = conductorPage.locator('button[id^="cancelar-"]');
    await expect(cancelarConductor).toHaveCount(1, { timeout: 15_000 });
    await cancelarConductor.first().click();
    await expect(cancelarConductor).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});
