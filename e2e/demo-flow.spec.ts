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

    // Paso 1 del emparejamiento (docs/esquema_base_datos.md sección 5): el
    // pasajero elige uno de sus candidatos.
    await pasajeroPage.goto("/consultar");
    const elegirComoPasajero = pasajeroPage
      .getByRole("button", { name: "Elegir este viaje" })
      .first();
    await expect(elegirComoPasajero).toBeVisible({ timeout: 20_000 });
    await elegirComoPasajero.click();
    await expect(pasajeroPage.getByText(/falta que el conductor lo confirme/i)).toBeVisible({
      timeout: 10_000,
    });

    // Paso 2: el conductor ve al pasajero ya confirmado y elige también —
    // eso crea confirmed_trips y borra ambas ofertas.
    await conductorPage.goto("/consultar");
    const elegirComoConductor = conductorPage
      .getByRole("button", { name: "Elegir este viaje" })
      .first();
    await expect(elegirComoConductor).toBeVisible({ timeout: 20_000 });
    await elegirComoConductor.click();
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
