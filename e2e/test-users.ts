// Usuarios de prueba fijos para la suite de e2e. Se crean (o se reusan, si
// ya existen de una corrida anterior) en e2e/global-setup.ts vía la API de
// administración de Supabase Auth — nunca pasan por el flujo real de correo,
// así que la contraseña de abajo es la única forma de entrar con ellos.
//
// El dominio @itam.mx es obligatorio: el Auth Hook
// restrict_signup_to_itam_domain (ver supabase/migrations/0002_functions.sql)
// rechaza cualquier otro dominio.

export const TEST_PASSWORD = "CarpoolItamE2E!2026";

export const CONDUCTOR = {
  email: "e2e.conductor@itam.mx",
  fullName: "E2E Conductor de Prueba",
  phone: "5500000001",
};

export const PASAJERO = {
  email: "e2e.pasajero@itam.mx",
  fullName: "E2E Pasajero de Prueba",
  phone: "5500000002",
};

// Usuarios dedicados a e2e/feed-flow.spec.ts (feed del home, ver
// PROGRESS.md "Feed en tiempo real" y "Solicitudes urgentes"). Separados de
// CONDUCTOR/PASAJERO de arriba a propósito: ese par termina la corrida con
// un viaje 'confirmado' de ida (demo-flow.spec.ts), y si el feed-flow
// reusara al mismo PASAJERO ya tendría la dirección "ida" bloqueada antes
// de siquiera abrir el feed -- con test users propios cada spec es
// independiente sin importar el orden en que corran.
// fullName arranca con una palabra distinta para cada uno a propósito: el
// feed (app/(app)/home/page.tsx) muestra el PRIMER nombre del conductor en
// la tarjeta (driverFirstName = fullName.split(/\s+/)[0], ver
// lib/actions/feed.ts) — si ambos empezaran con "E2E" (como CONDUCTOR/
// PASAJERO de arriba) las dos tarjetas del feed serían indistinguibles por
// texto en e2e/feed-flow.spec.ts.
export const CONDUCTOR_FEED_A = {
  email: "e2e.conductor.feed.a@itam.mx",
  fullName: "FeedA ConductorPrueba",
  phone: "5500000003",
};

export const CONDUCTOR_FEED_B = {
  email: "e2e.conductor.feed.b@itam.mx",
  fullName: "FeedB ConductorPrueba",
  phone: "5500000004",
};

export const PASAJERO_FEED = {
  email: "e2e.pasajero.feed@itam.mx",
  fullName: "FeedPasajero Prueba",
  phone: "5500000005",
};

// Usuarios dedicados a e2e/rechazo-flow.spec.ts (CU-E2E-03 de
// docs/casos_de_uso.md: ciclo completo de rechazo -- pasajero elige,
// conductor rechaza, pasajero ve el aviso y elige un viaje DISTINTO de la
// misma dirección). Mismo motivo que los *_FEED de arriba: usuarios propios
// para no compartir estado con los otros dos specs sin importar el orden en
// que Playwright los corra.
export const CONDUCTOR_RECHAZO_A = {
  email: "e2e.conductor.rechazo.a@itam.mx",
  fullName: "RechazoA ConductorPrueba",
  phone: "5500000006",
};

export const CONDUCTOR_RECHAZO_B = {
  email: "e2e.conductor.rechazo.b@itam.mx",
  fullName: "RechazoB ConductorPrueba",
  phone: "5500000007",
};

export const PASAJERO_RECHAZO = {
  email: "e2e.pasajero.rechazo@itam.mx",
  fullName: "RechazoPasajero Prueba",
  phone: "5500000008",
};

// Usuarios dedicados a e2e/cancelacion-flow.spec.ts (CU-COND-11/12, CU-PAS-14,
// CU-E2E-05/06 de docs/casos_de_uso.md: cancelar una oferta propia en
// 'buscando' sin nadie esperando, un conductor cancelando mientras un
// pasajero espera respuesta, y un pasajero cancelando su propia solicitud
// mientras espera). Tres pares/uno dedicados, uno por escenario -- mismo
// motivo que el resto de los grupos de arriba: usuarios propios para no
// compartir estado entre specs sin importar el orden en que corran.
export const CONDUCTOR_CANCELA_SOLO = {
  email: "e2e.conductor.cancela.solo@itam.mx",
  fullName: "CancelaSolo ConductorPrueba",
  phone: "5500000009",
};

export const CONDUCTOR_CANCELA_PENDIENTE = {
  email: "e2e.conductor.cancela.pendiente@itam.mx",
  fullName: "CancelaPendiente ConductorPrueba",
  phone: "5500000010",
};

export const PASAJERO_CANCELADO_POR_CONDUCTOR = {
  email: "e2e.pasajero.cancelado.conductor@itam.mx",
  fullName: "CanceladoPorConductor Pasajero",
  phone: "5500000011",
};

export const CONDUCTOR_ESPERA_CANCELACION = {
  email: "e2e.conductor.espera.cancelacion@itam.mx",
  fullName: "EsperaCancelacion ConductorPrueba",
  phone: "5500000012",
};

export const PASAJERO_CANCELA_PROPIA = {
  email: "e2e.pasajero.cancela.propia@itam.mx",
  fullName: "CancelaPropia Pasajero",
  phone: "5500000013",
};

// Usuarios dedicados a e2e/regreso-flow.spec.ts (CU-COND-03/04 de
// docs/casos_de_uso.md: publicar un viaje de REGRESO con punto de encuentro,
// y la validación de servidor cuando el punto de encuentro llega vacío tras
// recortar espacios). Ningún otro spec publica todavía un viaje de
// `direction: "regreso"` -- mismo motivo de siempre para usuarios propios.
export const CONDUCTOR_REGRESO = {
  email: "e2e.conductor.regreso@itam.mx",
  fullName: "Regreso ConductorPrueba",
  phone: "5500000014",
};

export const PASAJERO_REGRESO = {
  email: "e2e.pasajero.regreso@itam.mx",
  fullName: "RegresoPasajero Prueba",
  phone: "5500000015",
};

export const CONDUCTOR_REGRESO_INVALIDO = {
  email: "e2e.conductor.regreso.invalido@itam.mx",
  fullName: "RegresoInvalido ConductorPrueba",
  phone: "5500000016",
};

// Usuarios dedicados a e2e/chat-flow.spec.ts (CU-CHAT-01/02 de
// docs/casos_de_uso.md, sección G: intercambio de mensajes en tiempo real
// por viaje confirmado, y la verificación negativa de que un tercero ajeno
// no puede entrar al chat de otros dos usuarios). Dos pares distintos —
// CHAT/CHAT_2 — para que CU-CHAT-02 tenga su propio confirmed_trip sin
// chocar con el de CU-CHAT-01 (ambos usan direction: "ida"; reusar el mismo
// par haría que el segundo intento de "elegir" fallara por
// tieneSolicitudActivaEnDireccion, que ya bloquea una segunda solicitud de
// ida mientras la primera sigue 'confirmado'). USUARIO_AJENO_CHAT es el
// tercero que intenta entrar sin pertenecer a ningún viaje — primera prueba
// negativa de RLS explícita de toda la suite.
export const CONDUCTOR_CHAT = {
  email: "e2e.conductor.chat@itam.mx",
  fullName: "Chat ConductorPrueba",
  phone: "5500000017",
};

export const PASAJERO_CHAT = {
  email: "e2e.pasajero.chat@itam.mx",
  fullName: "ChatPasajero Prueba",
  phone: "5500000018",
};

export const CONDUCTOR_CHAT_2 = {
  email: "e2e.conductor.chat2@itam.mx",
  fullName: "Chat2 ConductorPrueba",
  phone: "5500000019",
};

export const PASAJERO_CHAT_2 = {
  email: "e2e.pasajero.chat2@itam.mx",
  fullName: "Chat2Pasajero Prueba",
  phone: "5500000020",
};

export const USUARIO_AJENO_CHAT = {
  email: "e2e.ajeno.chat@itam.mx",
  fullName: "Ajeno ChatPrueba",
  phone: "5500000021",
};
