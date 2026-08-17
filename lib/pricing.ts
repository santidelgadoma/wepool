// Estimación de precio/ganancia — el "edge" competitivo del producto frente
// a Uber/Didi: el conductor gana un ingreso marginal por un trayecto que de
// todos modos iba a hacer (ir al trabajo/la universidad), así que el precio
// al pasajero puede ser mucho más bajo que un viaje por app tradicional. Ver
// PROGRESS.md, sección "Modelo de negocio / pitch".
//
// Es una estimación simple pensada para la demo — no hay cobro real todavía
// (eso es Fase 4/5+: Stripe o similar). Se calcula a partir de la distancia
// en línea recta que ya se usa para estimar la duración del trayecto
// compartido (ver lib/actions/consultar.ts), así que no depende de ninguna
// tabla ni columna nueva.

const TARIFA_BASE_MXN = 10;
const TARIFA_POR_KM_MXN = 3.5;
// Comisión de la plataforma sobre lo que paga el pasajero — el resto es
// ganancia directa del conductor. Baja a propósito: el negocio se sostiene
// por volumen, no por cobrar como un servicio de taxi tradicional.
const COMISION_PLATAFORMA = 0.15;
const REDONDEO_MXN = 5;

// Velocidad promedio asumida para convertir duración <-> distancia mientras
// se conecta Google Distance Matrix (Fase 4). Centralizada aquí porque tanto
// lib/actions/consultar.ts (al calcular la duración desde la distancia real
// de PostGIS) como esta estimación de precio (al reconstruir la distancia
// desde la duración ya guardada) necesitan el mismo valor — si cada archivo
// tuviera su propia constante, podrían desincronizarse.
export const VELOCIDAD_PROMEDIO_KMH = 22;

export type EstimacionPrecio = {
  precioPasajeroMXN: number;
  gananciaConductorMXN: number;
};

function redondear(valor: number): number {
  return Math.max(REDONDEO_MXN, Math.round(valor / REDONDEO_MXN) * REDONDEO_MXN);
}

export function estimarPrecioViaje(distanciaKm: number): EstimacionPrecio {
  const precioPasajeroMXN = redondear(TARIFA_BASE_MXN + TARIFA_POR_KM_MXN * distanciaKm);
  const gananciaConductorMXN = redondear(precioPasajeroMXN * (1 - COMISION_PLATAFORMA));
  return { precioPasajeroMXN, gananciaConductorMXN };
}

// Para pantallas que ya solo tienen la duración guardada (p.ej. /manana, que
// lee confirmed_trips -> trip_matches.estimated_duration_minutes) y no
// vuelven a calcular la distancia real.
export function estimarPrecioDesdeDuracionMinutos(estimatedDurationMinutes: number): EstimacionPrecio {
  const distanciaKm = (estimatedDurationMinutes / 60) * VELOCIDAD_PROMEDIO_KMH;
  return estimarPrecioViaje(distanciaKm);
}

export function formatearMXN(valor: number): string {
  return valor.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

// Forma en la que PostgREST puede devolver una relación embebida a
// trip_matches (objeto único u arreglo de uno, según la versión del cliente
// que resuelva la relación) — usado en /manana y /historial, que leen
// confirmed_trips y embeben trip_matches para reconstruir el precio sin
// duplicar la consulta.
export type TripMatchEmbebido =
  | { estimated_duration_minutes: number }
  | { estimated_duration_minutes: number }[]
  | null;

export function duracionDeMatchEmbebido(trip_matches: TripMatchEmbebido): number | null {
  if (!trip_matches) return null;
  const match = Array.isArray(trip_matches) ? trip_matches[0] : trip_matches;
  return match?.estimated_duration_minutes ?? null;
}
