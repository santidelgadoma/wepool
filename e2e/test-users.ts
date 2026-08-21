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
