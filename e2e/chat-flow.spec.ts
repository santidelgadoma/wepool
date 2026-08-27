import { test, expect } from "@playwright/test";
import {
  CONDUCTOR_CHAT,
  PASAJERO_CHAT,
  CONDUCTOR_CHAT_2,
  PASAJERO_CHAT_2,
  USUARIO_AJENO_CHAT,
} from "./test-users";
import { login, publicarViaje } from "./helpers";

// CU-CHAT-01 y CU-CHAT-02 de docs/casos_de_uso.md (sección G): chat en
// tiempo real por viaje confirmado, y la verificación negativa de que un
// tercero ajeno al viaje no puede entrar a un chat que no le pertenece —
// primera prueba negativa de RLS explícita de toda la suite (ver
// docs/casos_de_uso.md hallazgo 9 y PROGRESS.md 2026-08-27).
//
// Dirección en Avenida Presidente Masaryk (Polanco) -- zona distinta a las
// que ya usan el resto de los specs (San Ángel/Insurgentes Sur, Insurgentes
// Norte, Av. Universidad), siguiendo la convención de CLAUDE.md. El riesgo
// de contaminación entre specs es bajo de cualquier forma: se usa el camino
// MANUAL (/reserva + /consultar, con ventana de 30 min), no el feed, que es
// el que de verdad necesita aislamiento geográfico estricto (ver
// docs/casos_de_uso.md hallazgo 7).

test("CU-CHAT-01: conductor y pasajero con viaje confirmado chatean en tiempo real, ambos ven los mensajes del otro sin recargar", async ({
  browser,
}) => {
  // Margen generoso: publicar dos veces (geocoding real vía Nominatim),
  // elegir/aceptar, y además dos rondas de mensajería en tiempo real que
  // dependen de que el broadcast de Supabase Realtime llegue a ambas
  // pestañas -- mismo tipo de dependencia de red real que ya justifica los
  // 150s en feed-flow.spec.ts/rechazo-flow.spec.ts/regreso-flow.spec.ts.
  test.setTimeout(150_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_CHAT.email);
    await login(pasajeroPage, PASAJERO_CHAT.email);

    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Avenida Presidente Masaryk 111, Ciudad de México",
      hora: "07:30",
      usaCuota: false,
    });

    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "ida",
      homeAddress: "Avenida Presidente Masaryk 200, Ciudad de México",
      hora: "07:30",
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

    // Entrar al chat desde /manana (único punto de entrada del producto,
    // ver app/(app)/manana/page.tsx) -- se extrae el tripId real de la URL
    // en vez de adivinarlo, así el pasajero puede navegar directo al mismo
    // chat sin tener que repetir la búsqueda del link.
    await conductorPage.goto("/manana");
    const chatLink = conductorPage.locator('a[href^="/chat/"]').first();
    await expect(chatLink).toBeVisible({ timeout: 15_000 });
    await chatLink.click();
    await expect(conductorPage).toHaveURL(/\/chat\//, { timeout: 15_000 });
    const tripId = conductorPage.url().split("/chat/")[1];

    // El pasajero entra al MISMO chat ANTES de que se mande cualquier
    // mensaje -- es lo que permite probar entrega en tiempo real de
    // verdad (sin recargar), no solo que el historial cargue bien al
    // entrar.
    await pasajeroPage.goto(`/chat/${tripId}`);
    await expect(pasajeroPage.locator("#mensaje-input")).toBeVisible({ timeout: 15_000 });

    // Conductor manda un mensaje -- debe aparecer en su propia pantalla
    // (sin inserción optimista, llega por el mismo broadcast que recibe la
    // contraparte, ver components/chat-window.tsx) y en la del pasajero,
    // SIN que el pasajero recargue ni navegue.
    const mensajeConductor = "Hola, te veo en la entrada del edificio a las 7:30";
    await conductorPage.locator("#mensaje-input").fill(mensajeConductor);
    await conductorPage.locator("#enviar-mensaje-submit").click();
    await expect(conductorPage.getByText(mensajeConductor)).toBeVisible({ timeout: 15_000 });
    await expect(pasajeroPage.getByText(mensajeConductor)).toBeVisible({ timeout: 15_000 });

    // Y en la otra dirección -- el pasajero responde, debe llegarle al
    // conductor sin que este recargue tampoco.
    const mensajePasajero = "Perfecto, ahí estaré";
    await pasajeroPage.locator("#mensaje-input").fill(mensajePasajero);
    await pasajeroPage.locator("#enviar-mensaje-submit").click();
    await expect(pasajeroPage.getByText(mensajePasajero)).toBeVisible({ timeout: 15_000 });
    await expect(conductorPage.getByText(mensajePasajero)).toBeVisible({ timeout: 15_000 });
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
  }
});

test("CU-CHAT-02: un usuario ajeno al viaje no puede entrar al chat de otros dos usuarios", async ({
  browser,
}) => {
  test.setTimeout(150_000);

  const conductorContext = await browser.newContext();
  const pasajeroContext = await browser.newContext();
  const ajenoContext = await browser.newContext();
  const conductorPage = await conductorContext.newPage();
  const pasajeroPage = await pasajeroContext.newPage();
  const ajenoPage = await ajenoContext.newPage();

  try {
    await login(conductorPage, CONDUCTOR_CHAT_2.email);
    await login(pasajeroPage, PASAJERO_CHAT_2.email);

    await publicarViaje(conductorPage, {
      role: "conductor",
      direction: "ida",
      homeAddress: "Avenida Presidente Masaryk 350, Ciudad de México",
      hora: "07:45",
      usaCuota: false,
    });

    await publicarViaje(pasajeroPage, {
      role: "pasajero",
      direction: "ida",
      homeAddress: "Avenida Presidente Masaryk 400, Ciudad de México",
      hora: "07:45",
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
    await chatLink.click();
    await expect(conductorPage).toHaveURL(/\/chat\//, { timeout: 15_000 });
    const tripId = conductorPage.url().split("/chat/")[1];

    // El tercero ajeno intenta entrar directo por URL -- ni siquiera pasó
    // por /manana, no tiene ningún link visible a este chat en su propia
    // interfaz. obtenerChatInicial (lib/actions/mensajes.ts) valida que
    // sea driver_id/passenger_id de ese confirmed_trip antes de regresar
    // cualquier dato; si no, la página redirige a /manana en vez de
    // mostrar un error técnico (ver app/(app)/chat/[tripId]/page.tsx). La
    // política RLS de trip_messages/realtime.messages
    // (supabase/migrations/0010_chat.sql) lo rechazaría de todas formas
    // incluso si esta defensa de la página no existiera.
    await login(ajenoPage, USUARIO_AJENO_CHAT.email);
    await ajenoPage.goto(`/chat/${tripId}`);
    await expect(ajenoPage).toHaveURL(/\/manana/, { timeout: 15_000 });
    await expect(ajenoPage.locator("#mensaje-input")).toHaveCount(0);
  } finally {
    await conductorContext.close();
    await pasajeroContext.close();
    await ajenoContext.close();
  }
});
