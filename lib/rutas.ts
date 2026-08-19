// Tiempo y distancia de manejo REALES entre dos puntos, vía Google Routes
// API (computeRouteMatrix) — reemplaza el estimado de línea recta
// (Haversine/PostGIS ST_Distance) + velocidad promedio constante que se
// usaba hasta ahora (ver lib/pricing.ts::VELOCIDAD_PROMEDIO_KMH, que se
// queda como fallback para cuando Google no está configurado o no
// responde, no se quitó de lib/pricing.ts).
//
// Se usa la Routes API (routes.googleapis.com), NO la Distance Matrix API
// clásica (distancematrix.googleapis.com): aunque la clásica sigue
// funcionando, Google la posiciona como reemplazada desde 2024 y toda la
// documentación/guías nuevas apuntan a Routes API — no tenía caso construir
// sobre la que ya está en camino de discontinuarse.
//
// A propósito se pide el tier "Essentials" (no se manda `routingPreference:
// "TRAFFIC_AWARE"`) en vez de tráfico en tiempo real: para un piloto en
// etapa MVP, la diferencia de precisión no justifica pasar de 10,000
// elementos gratis al mes ($5/1000 después) a 5,000 gratis ($10/1000 con
// tráfico). Subir a tráfico real más adelante es agregar un solo campo acá
// — ver PROGRESS.md, "Integración de Google Maps — tiempo de viaje real",
// para el resto de la investigación de precios/API que sustenta esta
// decisión.

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
// Sin field mask, computeRouteMatrix regresa una respuesta vacía — hay que
// pedir explícitamente cada campo que se vaya a leer.
const FIELD_MASK = "originIndex,destinationIndex,duration,distanceMeters,condition";

export type RutaReal = {
  distanciaKm: number;
  duracionMinutos: number;
};

type Punto = { lat: number; lng: number };

type FilaRutaCruda = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  condition?: string;
};

function puntoAWaypoint(punto: Punto) {
  return {
    waypoint: { location: { latLng: { latitude: punto.lat, longitude: punto.lng } } },
  };
}

/**
 * Calcula la ruta real en auto de UN origen a VARIOS destinos en una sola
 * llamada — más barato y más rápido que una llamada por candidato, que es
 * el uso real aquí: "esta oferta contra su lista de ~20-30 candidatos ya
 * prefiltrados geoespacialmente por PostGIS" (ver find_candidate_offers /
 * find_driver_offers_near). Regresa un arreglo del mismo largo que
 * `destinos`, en el mismo orden.
 *
 * NUNCA lanza una excepción: si `GOOGLE_MAPS_API_KEY` no está configurada,
 * la llamada falla (red, cuota, lo que sea), o Google no encuentra ruta en
 * auto para un par en particular, esa posición del arreglo queda en `null`
 * en vez de tronar toda la función que la llama. Quien llama decide el
 * fallback (ver `duracionDesdeMetros` en lib/pricing.ts, usado en
 * lib/actions/consultar.ts y lib/actions/feed.ts) — mismo principio que ya
 * se usa en el resto de la app para servicios externos (ver
 * lib/geocoding.ts, `previsualizarDireccion` en lib/actions/reserva.ts).
 */
export async function calcularMatrizRutas(
  origen: Punto,
  destinos: Punto[]
): Promise<(RutaReal | null)[]> {
  const vacio: (RutaReal | null)[] = destinos.map(() => null);
  if (destinos.length === 0) return [];

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return vacio;

  let respuesta: Response;
  try {
    respuesta = await fetch(ROUTE_MATRIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        origins: [puntoAWaypoint(origen)],
        destinations: destinos.map(puntoAWaypoint),
        travelMode: "DRIVE",
      }),
    });
  } catch (err) {
    console.error("calcularMatrizRutas: no se pudo conectar a Google Routes API", err);
    return vacio;
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => "");
    console.error(
      "calcularMatrizRutas: Google Routes API respondió con error",
      respuesta.status,
      cuerpo
    );
    return vacio;
  }

  let filas: FilaRutaCruda[];
  try {
    filas = (await respuesta.json()) as FilaRutaCruda[];
  } catch (err) {
    console.error("calcularMatrizRutas: la respuesta de Google no era JSON válido", err);
    return vacio;
  }

  const resultado: (RutaReal | null)[] = destinos.map(() => null);
  for (const fila of filas) {
    const indice = fila.destinationIndex ?? 0;
    if (
      fila.condition !== "ROUTE_EXISTS" ||
      fila.duration === undefined ||
      fila.distanceMeters === undefined ||
      indice < 0 ||
      indice >= resultado.length
    ) {
      continue;
    }
    const segundos = Number(fila.duration.replace("s", ""));
    if (!Number.isFinite(segundos)) continue;
    resultado[indice] = {
      distanciaKm: fila.distanceMeters / 1000,
      duracionMinutos: Math.max(1, Math.round(segundos / 60)),
    };
  }

  return resultado;
}

/** Caso de un solo par (origen, destino) — envoltura sobre
 * calcularMatrizRutas para los lugares que solo necesitan una ruta (p.ej.
 * `unirmeAViaje` en lib/actions/feed.ts, que ya sabe con qué conductor
 * específico se está emparejando). Regresa `null` en los mismos casos que
 * calcularMatrizRutas (nunca lanza). */
export async function calcularRutaReal(origen: Punto, destino: Punto): Promise<RutaReal | null> {
  const [resultado] = await calcularMatrizRutas(origen, [destino]);
  return resultado ?? null;
}
