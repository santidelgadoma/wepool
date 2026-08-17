// Utilidades de fecha/hora para la regla de negocio de la tesina: "los viajes
// reservados deberán ser exclusivamente para el día siguiente", en la zona
// horaria de Ciudad de México.
//
// Nota: México dejó de observar horario de verano a nivel nacional desde la
// reforma de 2022, así que America/Mexico_City tiene un offset fijo de
// UTC-6 todo el año. Eso permite construir fechas en UTC sumando/restando 6
// horas de forma directa, sin depender de una librería de zonas horarias.
const ZONA_CDMX = "America/Mexico_City";
const OFFSET_CDMX = "-06:00";

/** Devuelve la fecha de "mañana" en CDMX como "YYYY-MM-DD", a partir de una
 * fecha de referencia (por default, el momento actual). */
export function fechaDeMananaCDMX(referencia: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_CDMX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referencia);

  const valor = (tipo: "year" | "month" | "day"): number => {
    const parte = partes.find((p) => p.type === tipo);
    return Number(parte?.value ?? "0");
  };

  const hoyUTC = new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
  hoyUTC.setUTCDate(hoyUTC.getUTCDate() + 1);
  return hoyUTC.toISOString().slice(0, 10);
}

/** Convierte un valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"),
 * interpretado como hora local de Ciudad de México, a un objeto Date (UTC). */
export function datetimeLocalCDMXaUTC(valorLocal: string): Date {
  return new Date(`${valorLocal}:00${OFFSET_CDMX}`);
}

/** Rango [inicio, fin) en UTC (ISO strings) del día de mañana en CDMX. Útil
 * para filtrar confirmed_trips con scheduled_time dentro de "mañana". */
export function rangoUTCDeManana(referencia: Date = new Date()): {
  inicio: string;
  fin: string;
} {
  const fecha = fechaDeMananaCDMX(referencia);
  const inicio = datetimeLocalCDMXaUTC(`${fecha}T00:00`);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

/** Formatea un timestamp (ISO string, tal como viene de Postgres) para
 * mostrarlo en CDMX, ej. "lun, 18 ago, 08:30". */
export function formatearFechaHoraCDMX(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_CDMX,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoTimestamp));
}
