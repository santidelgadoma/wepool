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
