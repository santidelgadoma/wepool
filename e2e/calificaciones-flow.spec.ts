import { test, expect } from "@playwright/test";
import {
  CONDUCTOR_RATE,
  PASAJERO_RATE,
  CONDUCTOR_RATE_NOSHOW,
  PASAJERO_RATE_NOSHOW,
  CONDUCTOR_RATE_COLUSION,
  PASAJERO_RATE_COLUSION,
} from "./test-users";
import { login, publicarViaje, completarViajeComoAdmin, crearClienteAdmin } from "./helpers";

// CU-RATE-01 a 06 y CU-E2E-09 de docs/casos_de_uso.md (sección H):
// calificaciones mutuas por viaje confirmado. Ver el hallazgo E-8 de ese
// documento sobre por qué estos specs usan el cliente admin
// (completarViajeComoAdmin, e2e/helpers.ts) para forzar
// confirmed_trips.status = 'completado' en vez de esperar el pg_cron real de
// 15 minutos (complete_past_confirmed_trips, 0011_calificaciones.sql).
//
// Direcciones en Avenida Álvaro Obregón (Roma Norte) -- zona distinta a las
// que ya usan el resto de los specs (San Ángel/Insurgentes Sur, Insurgentes
// Norte, Av. Universidad, Av. Presidente Masaryk). Camino MANUAL
// (/reserva + /consultar), mismo razonamiento de siempre sobre por qué el
// riesgo de contaminación entre specs es bajo aquí.

test("CU-RATE-01/02/03/05 y CU-E2E-09: ciclo completo de calificación, no se puede calificar un viaje programado, es editable, y bloquea reservar hasta calificar", async ({
  browser,
}) => {
  // Más largo que el resto (180s en vez de 150s): esta prueba hace DOS
  // ciclos completos de publicar+elegir+aceptar (uno de ida, uno de
  // regreso, mismo día) más varias idas y vueltas a /historial y /reserva
  // para calificar y editar. Misma dependencia de red real (geocoding,
  // Supabase Auth) que ya justifica los márgenes generosos del resto de la
  // suite.
  test.setTimeout(180_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_RATE.email);
    await login(pasajeroPage, PASAJERO_RATE.email);

    // ─── Viaje A: ida (este es el que se fuerza a 'completado' y se califica) ──
    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Avenida Álvaro Obregón 111, Ciudad de México",
      hora: "07:15",
      usaCuota: false,
    });
    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "ida",
      homeAddress: "Avenida Álvaro Obregón 150, Ciudad de México",
      hora: "07:15",
    });

    await pasajeroPage.goto("/consultar");
    const elegirA = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegirA).toBeVisible({ timeout: 20_000 });
    await elegirA.click();
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await conductorPage.goto("/consultar");
    const aceptarA = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptarA).toBeVisible({ timeout: 20_000 });
    await aceptarA.click();
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    // Se extrae el tripId real desde /manana (mismo truco que
    // e2e/chat-flow.spec.ts) -- en este punto es el ÚNICO viaje confirmado
    // de este par, así que no hay ambigüedad.
    await conductorPage.goto("/manana");
    const chatLinkA = conductorPage.locator('a[href^="/chat/"]').first();
    await expect(chatLinkA).toBeVisible({ timeout: 15_000 });
    const hrefA = await chatLinkA.getAttribute("href");
    const tripAId = hrefA!.split("/chat/")[1];

    // ─── Viaje B: regreso (se deja EN 'programado' a propósito -- CU-RATE-02) ──
    // Mismo día, dirección distinta -- el máximo legítimo de 2 viajes
    // confirmados por día que permite el guardarraíl anti-colusión de
    // 0011_calificaciones.sql (tieneSolicitudActivaEnDireccion ya bloquea un
    // segundo "ida", pero "regreso" es una dirección distinta y no choca).
    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "regreso",
      homeAddress: "Avenida Álvaro Obregón 111, Ciudad de México",
      hora: "19:15",
      usaCuota: false,
    });
    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "regreso",
      homeAddress: "Avenida Álvaro Obregón 150, Ciudad de México",
      hora: "19:15",
    });

    await pasajeroPage.goto("/consultar");
    const elegirB = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegirB).toBeVisible({ timeout: 20_000 });
    await elegirB.click();
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await conductorPage.goto("/consultar");
    const aceptarB = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptarB).toBeVisible({ timeout: 20_000 });
    await aceptarB.click();
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    // Ahora hay DOS links de chat en /manana -- viaje B es el que no es A.
    await conductorPage.goto("/manana");
    await expect(conductorPage.locator('a[href^="/chat/"]')).toHaveCount(2, { timeout: 15_000 });
    const hrefs = await conductorPage
      .locator('a[href^="/chat/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    const hrefB = hrefs.find((h) => h && h.split("/chat/")[1] !== tripAId);
    const tripBId = hrefB!.split("/chat/")[1];

    // Solo el viaje A se fuerza a 'completado' -- el viaje B se queda
    // 'programado', para probar CU-RATE-02 justo abajo.
    await completarViajeComoAdmin(tripAId);

    // ─── CU-RATE-05 (parte 1): bloqueo real en /reserva ────────────────────
    await pasajeroPage.goto("/reserva");
    await expect(pasajeroPage.locator("#ir-a-calificar")).toBeVisible({ timeout: 15_000 });
    await expect(pasajeroPage.locator("#role-conductor")).toHaveCount(0);

    // ─── CU-RATE-02: no se puede calificar un viaje que sigue programado ───
    // CalificarForm (components/calificar-form.tsx) solo se renderiza para
    // tarjetas con status === 'completado' -- el viaje B, todavía
    // 'programado', no debe mostrar ningún control de calificación.
    await pasajeroPage.goto("/historial");
    await expect(pasajeroPage.locator(`#calificar-estrellas-${tripAId}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(pasajeroPage.locator(`#calificar-estrellas-${tripBId}`)).toHaveCount(0);
    await expect(pasajeroPage.locator(`#no-realizado-${tripBId}`)).toHaveCount(0);

    // ─── CU-RATE-01 / CU-E2E-09: calificar el viaje A ───────────────────────
    await pasajeroPage.locator(`#estrella-5-${tripAId}`).click();
    await pasajeroPage
      .locator(`#calificar-comentario-${tripAId}`)
      .fill("Excelente viaje, muy puntual.");
    await pasajeroPage.locator(`#calificar-enviar-${tripAId}`).click();
    // Tras guardar, el formulario pasa a modo lectura (botón "Editar").
    await expect(pasajeroPage.locator(`#calificar-editar-${tripAId}`)).toBeVisible({
      timeout: 10_000,
    });
    // El promedio del conductor (RatingBadge, "★ 5.0 (1)") ya debe verse en
    // la propia tarjeta -- revalidatePath("/historial") + el refresh
    // automático de Next.js tras un Server Action, sin recargar a mano.
    await expect(pasajeroPage.getByText("5.0 (1)").first()).toBeVisible({ timeout: 10_000 });

    // ─── CU-RATE-05 (parte 2): calificar desbloquea /reserva ───────────────
    await pasajeroPage.goto("/reserva");
    await expect(pasajeroPage.locator("#role-conductor")).toBeVisible({ timeout: 15_000 });
    await expect(pasajeroPage.locator("#ir-a-calificar")).toHaveCount(0);

    // ─── CU-RATE-03: la calificación es editable ────────────────────────────
    await pasajeroPage.goto("/historial");
    await pasajeroPage.locator(`#calificar-editar-${tripAId}`).click();
    await pasajeroPage.locator(`#estrella-3-${tripAId}`).click();
    await pasajeroPage.locator(`#calificar-enviar-${tripAId}`).click();
    await expect(pasajeroPage.locator(`#calificar-editar-${tripAId}`)).toBeVisible({
      timeout: 10_000,
    });
    // El promedio se recalcula in-place (upsert, no una fila nueva) --
    // sigue siendo 1 sola calificación, ahora con 3 estrellas.
    await expect(pasajeroPage.getByText("3.0 (1)").first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});

test("CU-RATE-04: 'este viaje no se realizó' cuenta como calificación para desbloquear, pero no afecta el promedio de nadie", async ({
  browser,
}) => {
  test.setTimeout(150_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_RATE_NOSHOW.email);
    await login(pasajeroPage, PASAJERO_RATE_NOSHOW.email);

    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Avenida Álvaro Obregón 200, Ciudad de México",
      hora: "07:20",
      usaCuota: false,
    });
    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "ida",
      homeAddress: "Avenida Álvaro Obregón 240, Ciudad de México",
      hora: "07:20",
    });

    await pasajeroPage.goto("/consultar");
    const elegir = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegir).toBeVisible({ timeout: 20_000 });
    await elegir.click();
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await conductorPage.goto("/consultar");
    const aceptar = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptar).toBeVisible({ timeout: 20_000 });
    await aceptar.click();
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    await conductorPage.goto("/manana");
    const chatLink = conductorPage.locator('a[href^="/chat/"]').first();
    await expect(chatLink).toBeVisible({ timeout: 15_000 });
    const href = await chatLink.getAttribute("href");
    const tripId = href!.split("/chat/")[1];

    await completarViajeComoAdmin(tripId);

    await pasajeroPage.goto("/historial");
    await pasajeroPage.locator(`#no-realizado-${tripId}`).click();
    await pasajeroPage.locator(`#calificar-enviar-${tripId}`).click();
    await expect(
      pasajeroPage.getByText("Marcaste que este viaje no se realizó.")
    ).toBeVisible({ timeout: 10_000 });

    // Desbloquea /reserva igual que una calificación real (decisión
    // confirmada: no-show cuenta para el bloqueo obligatorio).
    await pasajeroPage.goto("/reserva");
    await expect(pasajeroPage.locator("#role-conductor")).toBeVisible({ timeout: 15_000 });

    // Pero NO debe mover el rating_avg/rating_count del conductor -- el
    // trigger de agregado usa count(stars), que ignora las filas con
    // stars = null (ver 0011_calificaciones.sql). Se verifica directo en
    // la base de datos con el cliente admin en vez de solo por ausencia de
    // texto en la UI: es la forma más precisa de confirmar que el trigger
    // de verdad no contó esta fila, no solo que la pantalla no la muestra.
    const admin = crearClienteAdmin();
    const { data: viaje } = await admin
      .from("confirmed_trips")
      .select("driver_id")
      .eq("id", tripId)
      .single();
    const { data: perfilConductor } = await admin
      .from("profiles")
      .select("rating_avg, rating_count")
      .eq("id", viaje!.driver_id)
      .single();
    expect(perfilConductor?.rating_count).toBe(0);
    expect(perfilConductor?.rating_avg).toBeNull();
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});

test("CU-RATE-06: un mismo par de usuarios no puede tener más de 2 viajes confirmados el mismo día (anti-colusión)", async ({
  browser,
}) => {
  // El candado de dirección tieneSolicitudActivaEnDireccion
  // (lib/actions/solicitudes.ts) ya le impide a un pasajero real llegar a un
  // TERCER viaje confirmado el mismo día por el camino normal de la UI (solo
  // hay dos direcciones, ida y regreso, y cada una se bloquea en cuanto
  // queda 'confirmada') -- así que el trigger de base de datos
  // limitar_viajes_confirmados_por_dia (0011_calificaciones.sql) es en la
  // práctica una defensa que la UI nunca llega a ejercitar. Se prueba con un
  // insert DIRECTO vía el cliente admin (salta RLS y cualquier Server
  // Action) sobre los dos viajes legítimos que sí se crean por la UI --
  // es la única forma honesta de confirmar que el trigger de verdad protege
  // la tabla "sin importar por cuál Server Action se intente crear", como
  // dice su propio comentario en la migración.
  test.setTimeout(150_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_RATE_COLUSION.email);
    await login(pasajeroPage, PASAJERO_RATE_COLUSION.email);

    // Viaje 1: ida.
    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Avenida Álvaro Obregón 300, Ciudad de México",
      hora: "07:25",
      usaCuota: false,
    });
    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "ida",
      homeAddress: "Avenida Álvaro Obregón 340, Ciudad de México",
      hora: "07:25",
    });

    await pasajeroPage.goto("/consultar");
    const elegir1 = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegir1).toBeVisible({ timeout: 20_000 });
    await elegir1.click();
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await conductorPage.goto("/consultar");
    const aceptar1 = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptar1).toBeVisible({ timeout: 20_000 });
    await aceptar1.click();
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    await conductorPage.goto("/manana");
    const chatLink1 = conductorPage.locator('a[href^="/chat/"]').first();
    await expect(chatLink1).toBeVisible({ timeout: 15_000 });
    const href1 = await chatLink1.getAttribute("href");
    const trip1Id = href1!.split("/chat/")[1];

    // Viaje 2: regreso, mismo día -- el segundo de los 2 legítimos.
    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "regreso",
      homeAddress: "Avenida Álvaro Obregón 300, Ciudad de México",
      hora: "19:25",
      usaCuota: false,
    });
    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "regreso",
      homeAddress: "Avenida Álvaro Obregón 340, Ciudad de México",
      hora: "19:25",
    });

    await pasajeroPage.goto("/consultar");
    const elegir2 = pasajeroPage.locator('button[id^="elegir-"]').first();
    await expect(elegir2).toBeVisible({ timeout: 20_000 });
    await elegir2.click();
    await expect(pasajeroPage.getByText("¡Elegido! Revisa el estado en Inicio.")).toBeVisible({
      timeout: 10_000,
    });

    await conductorPage.goto("/consultar");
    const aceptar2 = conductorPage.locator('button[id^="aceptar-"]').first();
    await expect(aceptar2).toBeVisible({ timeout: 20_000 });
    await aceptar2.click();
    await expect(
      conductorPage.getByText("¡Viaje confirmado! Ya puedes verlo en Mañana.")
    ).toBeVisible({ timeout: 10_000 });

    // Con los 2 viajes legítimos ya confirmados, se arma el tercero a mano
    // con el cliente admin -- mismo driver_id/passenger_id/vehicle_id que el
    // viaje 1 (así el insert es válido en todo lo demás, y lo único que
    // debe rechazarlo es el trigger anti-colusión), una hora después ese
    // mismo día.
    const admin = crearClienteAdmin();
    const { data: viaje1 } = await admin
      .from("confirmed_trips")
      .select("driver_id, passenger_id, vehicle_id, home_address, scheduled_time")
      .eq("id", trip1Id)
      .single();

    const horaTercerViaje = new Date(
      new Date(viaje1!.scheduled_time).getTime() + 60 * 60 * 1000
    ).toISOString();

    const { error } = await admin.from("confirmed_trips").insert({
      driver_id: viaje1!.driver_id,
      passenger_id: viaje1!.passenger_id,
      direction: "ida",
      vehicle_id: viaje1!.vehicle_id,
      home_address: viaje1!.home_address,
      scheduled_time: horaTercerViaje,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("máximo 2, ida y regreso");
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});
