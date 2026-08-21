import { test, expect } from "@playwright/test";
import { CONDUCTOR, PASAJERO } from "./test-users";
import { login, publicarViaje } from "./helpers";

// Cubre el flujo completo que verá un inversionista en la demo: dos personas
// (conductor y pasajero) publican viajes compatibles de ida, se emparejan,
// ambos confirman, y el viaje aparece en "Viajes de mañana" para los dos.
// Ver PROGRESS.md, Fase 5, "Prueba de flujo completo extremo a extremo".
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (para e2e/global-setup.ts)
// y la migración supabase/migrations/0003_matching_helpers.sql ya aplicada
// en el proyecto de Supabase real.
test("conductor y pasajero se emparejan y confirman un viaje de ida", async ({ browser }) => {
  test.setTimeout(120_000);

  // Dos sesiones de navegador independientes: el conductor y el pasajero
  // nunca comparten cookies, igual que en la vida real.
  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR.email);
    await login(pasajeroPage, PASAJERO.email);

    // Hora deliberadamente lejos de los horarios de scripts/seed.ts (07:30,
    // 08:00, 08:10 de ida) — find_candidate_offers empareja dentro de una
    // ventana de 30 min, así que si este test corre con datos de seed ya
    // cargados (el flujo normal: `npm run seed` el día antes de la demo, y
    // luego `npm run test:e2e` para confirmar que no se rompió nada), los
    // conductores/pasajeros de ejemplo del ITAM (p.ej. Valentina, Emilio)
    // podían colarse como candidatos junto con la contraparte real de este
    // test y el `.first()` de abajo elegía a quien fuera primero por
    // duración estimada, no necesariamente al otro usuario de prueba — el
    // test entonces confirmaba con un conductor/pasajero equivocado y el
    // paso 2 se quedaba esperando un botón que nunca aparecía. 10:30 queda a
    // más de 2 horas de cualquier horario de ida del seed, fuera de la
    // ventana de 30 min por buen margen.
    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Av. Insurgentes Sur 3000, Ciudad de México",
      hora: "10:30",
      usaCuota: false,
    });

    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "ida",
      homeAddress: "Av. Revolución 1500, Ciudad de México",
      hora: "10:30",
    });

    // Paso 1 del emparejamiento (docs/esquema_base_datos.md sección 5, y ver
    // PROGRESS.md "Solicitudes urgentes"): el pasajero elige uno de sus
    // candidatos — eso marca ambas ofertas (la propia y la del conductor)
    // como 'pendiente', así que la tarjeta desaparece de /consultar de
    // inmediato; el estado de espera persistente ahora vive en /home.
    await pasajeroPage.goto("/consultar");
    // ElegirBoton lleva id={`elegir-${matchId}`} (ver components/elegir-boton.tsx)
    // en vez de solo texto visible -- un cambio de copy ("Elegir este viaje")
    // ya no puede romper este test en silencio.
    const elegirComoPasajero = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegirComoPasajero).toBeVisible({ timeout: 20_000 });
    await elegirComoPasajero.click();
    // elegir-boton.tsx solo muestra "¡Elegido!..." DESPUÉS de que
    // elegirCandidato() ya resolvió (ver el await dentro de startTransition en
    // ese componente) -- hay que esperar este texto antes de navegar a /home,
    // si no la navegación puede ganarle la carrera al escritura en la base de
    // datos y /home se renderiza server-side con el estado viejo (sin
    // "esperando respuesta del conductor"), sin que ningún refresh posterior
    // lo corrija porque la página ya se sirvió una sola vez.
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await pasajeroPage.goto("/home");
    await expect(pasajeroPage.getByText(/esperando respuesta del conductor/i)).toBeVisible({
      timeout: 10_000,
    });

    // Paso 2: la solicitud le aparece al conductor como notificación urgente
    // en cualquier pantalla (banner global, app/(app)/layout.tsx) y también
    // en /consultar ("Solicitudes por responder", mismo componente). Aceptar
    // crea confirmed_trips y pasa ambas ofertas a 'confirmado'.
    await conductorPage.goto("/consultar");
    // SolicitudCard lleva id={`aceptar-${matchId}`} / id={`rechazar-${matchId}`}
    // (ver components/solicitud-card.tsx) por la misma razón de arriba.
    const aceptarComoConductor = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptarComoConductor).toBeVisible({ timeout: 20_000 });
    await aceptarComoConductor.click();
    // Mismo motivo que el "¡Elegido!..." de arriba: SolicitudCard solo
    // muestra este texto DESPUÉS de que responderSolicitud() ya resolvió
    // (incluyendo el insert de confirmed_trips) -- "Todavía no hay
    // candidatos compatibles" de abajo es cierto en cuanto la oferta propia
    // deja de estar en 'buscando', que puede pasar ANTES de que termine de
    // crearse confirmed_trips, así que por sí solo no garantiza que el viaje
    // ya esté confirmado a tiempo para el goto("/manana") de abajo (visto en
    // una corrida real: /manana cargó antes de que el insert terminara).
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(conductorPage.getByText("Todavía no hay candidatos compatibles")).toBeVisible({
      timeout: 10_000,
    });

    // El viaje confirmado debe verse en "mañana" para ambos, con el rol
    // correcto según quién lo esté viendo.
    await conductorPage.goto("/manana");
    await expect(conductorPage.getByText(/^Conductor/)).toBeVisible();

    await pasajeroPage.goto("/manana");
    await expect(pasajeroPage.getByText(/^Pasajero/)).toBeVisible();
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});
