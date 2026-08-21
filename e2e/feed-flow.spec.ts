import { test, expect, type Page } from "@playwright/test";
import { CONDUCTOR_FEED_A, CONDUCTOR_FEED_B, PASAJERO_FEED } from "./test-users";
import { login, publicarViaje, guardarUbicacionCasa } from "./helpers";

// Cubre el flujo del feed del home (ver PROGRESS.md, "Rediseño del home —
// feed de viajes" y "Solicitudes urgentes"): un pasajero guarda su dirección
// de casa, ve varios viajes disponibles cerca, elige uno, y valida que la
// pantalla se actualiza en consecuencia -- incluyendo el bug reportado por
// captura de pantalla ("Debug en vivo" en PROGRESS.md) donde las OTRAS
// tarjetas de la misma dirección no desaparecían al elegir una.
//
// Usa un tercer par+uno de usuarios de prueba (CONDUCTOR_FEED_A/B,
// PASAJERO_FEED, ver e2e/test-users.ts) separados de CONDUCTOR/PASAJERO que
// usa demo-flow.spec.ts, para que ambos archivos de test sean independientes
// entre sí sin importar el orden o si corren en paralelo.
//
// Requiere lo mismo que demo-flow.spec.ts: SUPABASE_SERVICE_ROLE_KEY en
// .env.local y las migraciones 0001-0009 aplicadas en el proyecto real de
// Supabase.
test("pasajero ve varios viajes en el feed, elige uno y los demás desaparecen", async ({
  browser,
}) => {
  // 150s en vez de 120s: se agregó un paso de limpieza al final (cancelar la
  // oferta del conductor que nunca recibió solicitud, ver más abajo) sobre
  // una suite que ya de por sí depende de red real (Supabase Auth, geocoding
  // de Nominatim) — 120s se quedó corto por poco en una corrida real.
  test.setTimeout(150_000);

  const conductorAContext = await browser.newContext();
  const conductorBContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorAPage = await conductorAContext.newPage();
  const conductorBPage = await conductorBContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorAPage, CONDUCTOR_FEED_A.email);
    await login(conductorBPage, CONDUCTOR_FEED_B.email);
    await login(pasajeroPage, PASAJERO_FEED.email);

    // Dos conductores publican "ida" en el mismo tramo de Av. Revolución (a
    // pocas cuadras uno del otro, y del domicilio del pasajero de abajo) —
    // necesario para que el feed tenga MÁS DE UNA tarjeta entre las que
    // elegir. La hora no importa para el feed (obtenerFeed filtra por todo
    // el rango de "mañana", no por una ventana angosta como el matching de
    // /consultar) — se usan horas distintas solo para que sea fácil
    // diferenciarlas si hace falta depurar el test.
    await publicarViaje(conductorAPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Insurgentes Sur 3000, Ciudad de México",
      hora: "14:00",
      usaCuota: false,
    });
    await publicarViaje(conductorBPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Revolución 1877, Ciudad de México",
      hora: "14:15",
      usaCuota: false,
    });

    // El pasajero todavía no tiene ninguna ubicación guardada -- HomePage
    // muestra el formulario de "Agrega tu dirección de casa" directo (ver
    // app/(app)/home/page.tsx), no el feed.
    await pasajeroPage.goto("/home");
    await guardarUbicacionCasa(pasajeroPage, "Av. Revolución 1500, Ciudad de México");

    // obtenerFeed calcula rutas reales vía Google Routes API si está
    // configurada (lib/rutas.ts) -- margen generoso antes de esperar que las
    // dos tarjetas aparezcan. Los botones "Unirme a este viaje" llevan
    // id={`unirme-${driverOfferId}`} (ver components/unirme-boton.tsx), así
    // que se localizan por prefijo de id en vez de por texto.
    const botonesUnirme = pasajeroPage.locator('button[id^="unirme-"]');
    await expect(botonesUnirme).toHaveCount(2, { timeout: 30_000 });

    await botonesUnirme.first().click();
    await expect(
      pasajeroPage.getByText("¡Te uniste! Esperando confirmación del conductor.")
    ).toBeVisible({ timeout: 10_000 });

    // Regresión del bug reportado por captura de pantalla ("Aqui deberia
    // desaparecer el resto de los viajes y quedarse solo este como
    // pendiente"): tras elegir UN viaje de "ida", TODAS las tarjetas de esa
    // dirección deben esconderse del feed -- incluida la del conductor que
    // NO se eligió -- y en su lugar debe verse una sola tarjeta de estado
    // "esperando respuesta del conductor".
    await expect(botonesUnirme).toHaveCount(0, { timeout: 15_000 });
    await expect(pasajeroPage.getByText(/esperando respuesta del conductor/i)).toBeVisible();

    // El conductor cuya oferta se eligió (no sabemos de antemano si fue A o
    // B, `.first()` depende del orden en que Postgres devolvió las filas)
    // recibe la solicitud urgente en /consultar ("Solicitudes por
    // responder", ver components/solicitud-card.tsx); el otro conductor no
    // debería tener ninguna solicitud pendiente.
    await conductorAPage.goto("/consultar");
    await conductorBPage.goto("/consultar");
    const [tieneSolicitudA, tieneSolicitudB] = await Promise.all([
      esperaBotonAceptar(conductorAPage),
      esperaBotonAceptar(conductorBPage),
    ]);
    expect(
      tieneSolicitudA !== tieneSolicitudB,
      "Exactamente uno de los dos conductores debe tener la solicitud pendiente"
    ).toBe(true);

    const conductorConSolicitud = tieneSolicitudA ? conductorAPage : conductorBPage;
    const conductorSinSolicitud = tieneSolicitudA ? conductorBPage : conductorAPage;
    await conductorConSolicitud.locator('button[id^="aceptar-"]').first().click();
    await expect(
      conductorConSolicitud.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    // El conductor que NUNCA recibió una solicitud se queda con su oferta en
    // 'buscando' para siempre (nadie la tocó) -- si no se cancela aquí, esa
    // oferta sigue viva en la base de datos real y contamina el feed de
    // CUALQUIER OTRO spec que publique dentro de los mismos 15km, sin
    // importar qué usuarios de prueba use (ver rechazo-flow.spec.ts, que usa
    // el mismo tramo de Av. Revolución/Insurgentes Sur y se topó exactamente
    // con este residuo). Se cancela por la UI, como lo haría un conductor
    // real que ya no quiere ofrecer el viaje.
    await conductorSinSolicitud.goto("/cancelar");
    const cancelarSinSolicitud = conductorSinSolicitud.locator('button[id^="cancelar-"]').first();
    await expect(cancelarSinSolicitud).toBeVisible({ timeout: 10_000 });
    await cancelarSinSolicitud.click();
    await expect(conductorSinSolicitud.locator('button[id^="cancelar-"]')).toHaveCount(0, {
      timeout: 10_000,
    });

    // El pasajero debe ver su viaje pasar de "esperando respuesta" a
    // "confirmado" -- y poder llegar a Viajes de mañana desde ahí.
    await pasajeroPage.goto("/home");
    await expect(
      pasajeroPage.getByText(/ya tienes un viaje de ida confirmado/i)
    ).toBeVisible({ timeout: 10_000 });

    await pasajeroPage.goto("/manana");
    await expect(pasajeroPage.getByText(/^Pasajero/)).toBeVisible();
  } finally {
    await conductorAContext.close();
    await conductorBContext.close();
    await pasajeroContext.close();
  }
});

async function esperaBotonAceptar(page: Page): Promise<boolean> {
  try {
    await page.locator('button[id^="aceptar-"]').first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}
