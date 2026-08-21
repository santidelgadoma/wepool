import { test, expect, type Page } from "@playwright/test";
import { CONDUCTOR_RECHAZO_A, CONDUCTOR_RECHAZO_B, PASAJERO_RECHAZO } from "./test-users";
import { login, publicarViaje, guardarUbicacionCasa } from "./helpers";

// CU-E2E-03 de docs/casos_de_uso.md: "Ciclo completo de RECHAZO: pasajero
// elige → conductor rechaza → pasajero ve el aviso → elige un viaje DISTINTO
// de la misma dirección → se confirma". Antes de este spec, solo se probaba
// el camino de "aceptar" (demo-flow.spec.ts, feed-flow.spec.ts) — nunca
// "rechazar", que es la otra mitad de responderSolicitud
// (lib/actions/solicitudes.ts) y del bloqueo por dirección.
//
// Reusa el patrón de dos conductores de feed-flow.spec.ts (necesario aquí
// también: después de que rechazan al primero, hace falta un segundo viaje
// de la MISMA dirección para poder elegir "uno distinto") pero con usuarios
// de prueba propios (CONDUCTOR_RECHAZO_A/B, PASAJERO_RECHAZO) para no
// compartir estado con los otros dos specs sin importar el orden en que
// Playwright los corra.
//
// Requiere lo mismo que los otros specs: SUPABASE_SERVICE_ROLE_KEY en
// .env.local y las migraciones 0001-0009 aplicadas en el proyecto real de
// Supabase.
test("el pasajero elige un viaje, el conductor lo rechaza, y el pasajero elige uno distinto de la misma dirección", async ({
  browser,
}) => {
  // 180s en vez de 150s: mismo motivo que feed-flow.spec.ts (paso de limpieza
  // nuevo al final) mas un ciclo completo extra (rechazo + segunda elección)
  // sobre la misma suite dependiente de red real.
  test.setTimeout(180_000);

  const conductorAContext = await browser.newContext();
  const conductorBContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorAPage = await conductorAContext.newPage();
  const conductorBPage = await conductorBContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorAPage, CONDUCTOR_RECHAZO_A.email);
    await login(conductorBPage, CONDUCTOR_RECHAZO_B.email);
    await login(pasajeroPage, PASAJERO_RECHAZO.email);

    // Mismo tramo de Av. Revolución/Insurgentes Sur que feed-flow.spec.ts,
    // ya probado como compatible. Horas distintas a las de los otros dos
    // specs (10:30, 14:00/14:15) solo para que sea fácil diferenciar en un
    // reporte si algo falla — obtenerFeed no filtra por ventana de tiempo,
    // así que la hora exacta no afecta el resultado.
    await publicarViaje(conductorAPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Insurgentes Sur 3000, Ciudad de México",
      hora: "15:00",
      usaCuota: false,
    });
    await publicarViaje(conductorBPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Revolución 1877, Ciudad de México",
      hora: "15:15",
      usaCuota: false,
    });

    await pasajeroPage.goto("/home");
    await guardarUbicacionCasa(pasajeroPage, "Av. Revolución 1500, Ciudad de México");

    const botonesUnirme = pasajeroPage.locator('button[id^="unirme-"]');
    await expect(botonesUnirme).toHaveCount(2, { timeout: 30_000 });

    // Se guarda el id del primer botón ANTES de darle clic -- hace falta
    // más adelante para poder elegir deliberadamente el OTRO viaje (no
    // basta con ".first()" de nuevo: tras el rechazo, ambas tarjetas vuelven
    // a estar disponibles y ".first()" podría volver a resolver a la misma).
    const primerBoton = botonesUnirme.first();
    const idPrimeraOferta = await primerBoton.getAttribute("id");
    expect(idPrimeraOferta).toBeTruthy();

    await primerBoton.click();
    await expect(
      pasajeroPage.getByText("¡Te uniste! Esperando confirmación del conductor.")
    ).toBeVisible({ timeout: 10_000 });

    // Mismo comportamiento que feed-flow.spec.ts: al elegir, TODAS las
    // tarjetas de "ida" se esconden (la dirección completa queda
    // bloqueada), no solo la elegida.
    await expect(botonesUnirme).toHaveCount(0, { timeout: 15_000 });
    await expect(pasajeroPage.getByText(/esperando respuesta del conductor/i)).toBeVisible();

    // No se sabe de antemano cuál de los dos conductores recibió la
    // solicitud -- se busca en ambas páginas de /consultar (mismo patrón que
    // feed-flow.spec.ts).
    await conductorAPage.goto("/consultar");
    await conductorBPage.goto("/consultar");
    const [tieneSolicitudA1, tieneSolicitudB1] = await Promise.all([
      esperaBotonVisible(conductorAPage, "aceptar"),
      esperaBotonVisible(conductorBPage, "aceptar"),
    ]);
    expect(
      tieneSolicitudA1 !== tieneSolicitudB1,
      "Exactamente uno de los dos conductores debe tener la solicitud pendiente"
    ).toBe(true);

    // A diferencia de demo-flow.spec.ts / feed-flow.spec.ts, aquí se
    // RECHAZA en vez de aceptar -- es la mitad del ciclo que ningún otro
    // spec prueba todavía.
    const conductorQueRechaza = tieneSolicitudA1 ? conductorAPage : conductorBPage;
    await conductorQueRechaza.locator('button[id^="rechazar-"]').first().click();
    await expect(
      conductorQueRechaza.getByText("Solicitud rechazada. Vuelve a estar disponible en el feed.")
    ).toBeVisible({ timeout: 10_000 });

    // El pasajero debe ver el aviso de rechazo, Y el feed de "ida" debe
    // volver a estar disponible en la MISMA carga (obtenerEstadoPasajero
    // limpia la oferta 'rechazado' en cuanto la lee, ver
    // lib/actions/solicitudes.ts) -- las DOS tarjetas deben reaparecer,
    // porque la oferta del conductor que rechazó vuelve a 'buscando' y la
    // del otro conductor nunca se tocó.
    await pasajeroPage.goto("/home");
    await expect(
      pasajeroPage.getByText("El conductor rechazó tu solicitud de ida.")
    ).toBeVisible({ timeout: 15_000 });
    await expect(botonesUnirme).toHaveCount(2, { timeout: 15_000 });

    // El aviso de rechazo se lee una sola vez -- en la SIGUIENTE visita ya
    // no debe aparecer (la oferta 'rechazado' que lo generaba se borró sola
    // al leerse la primera vez).
    await pasajeroPage.reload();
    await expect(
      pasajeroPage.getByText("El conductor rechazó tu solicitud de ida.")
    ).not.toBeVisible();

    // Elige deliberadamente el viaje DISTINTO al primero (CU-E2E-03) --
    // localizado por exclusión del id que se guardó antes de clic.
    const otroBoton = pasajeroPage.locator(
      `button[id^="unirme-"]:not([id="${idPrimeraOferta}"])`
    );
    await expect(otroBoton).toHaveCount(1);
    await otroBoton.click();
    await expect(
      pasajeroPage.getByText("¡Te uniste! Esperando confirmación del conductor.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(botonesUnirme).toHaveCount(0, { timeout: 15_000 });

    // Esta vez se acepta, para cerrar el ciclo completo hasta la
    // confirmación (CU-E2E-03: "...→ se confirma").
    await conductorAPage.goto("/consultar");
    await conductorBPage.goto("/consultar");
    const [tieneSolicitudA2, tieneSolicitudB2] = await Promise.all([
      esperaBotonVisible(conductorAPage, "aceptar"),
      esperaBotonVisible(conductorBPage, "aceptar"),
    ]);
    expect(
      tieneSolicitudA2 !== tieneSolicitudB2,
      "Exactamente uno de los dos conductores debe tener la nueva solicitud pendiente"
    ).toBe(true);

    const conductorQueAcepta = tieneSolicitudA2 ? conductorAPage : conductorBPage;
    const conductorSinConfirmar = tieneSolicitudA2 ? conductorBPage : conductorAPage;
    await conductorQueAcepta.locator('button[id^="aceptar-"]').first().click();
    await expect(
      conductorQueAcepta.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    // El conductor que rechazó al principio (o el que nunca recibió ninguna
    // solicitud) termina el test con su oferta en 'buscando' -- mismo
    // problema que en feed-flow.spec.ts: sin cancelarla, queda viva y puede
    // colarse en el feed de cualquier otro spec que publique dentro de los
    // mismos 15km. Se cancela por la UI, como haría un conductor real.
    await conductorSinConfirmar.goto("/cancelar");
    const cancelarSinConfirmar = conductorSinConfirmar.locator('button[id^="cancelar-"]').first();
    await expect(cancelarSinConfirmar).toBeVisible({ timeout: 10_000 });
    await cancelarSinConfirmar.click();
    await expect(conductorSinConfirmar.locator('button[id^="cancelar-"]')).toHaveCount(0, {
      timeout: 10_000,
    });

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

async function esperaBotonVisible(page: Page, accion: "aceptar" | "rechazar"): Promise<boolean> {
  try {
    await page.locator(`button[id^="${accion}-"]`).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}
