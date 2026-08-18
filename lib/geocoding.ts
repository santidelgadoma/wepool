// Geocoding temporal con OpenStreetMap Nominatim (gratuito, sin API key) para
// desbloquear Fase 3 (publicar/reservar viajes) mientras se conecta Google
// Maps Platform en Fase 4 — ver PROGRESS.md, "Geocoding y distance matrix
// (Google Maps)". Nominatim pide un User-Agent identificable y tiene un
// límite de ~1 solicitud/segundo; para el volumen de una demo es más que
// suficiente. Toda la app pasa por esta función, así que cuando se conecte
// GOOGLE_MAPS_API_KEY solo hay que reescribir este archivo — nada más
// cambia (el resto del código solo conoce { lat, lng }).

export class GeocodingError extends Error {}

export async function geocodificarDireccion(
  direccion: string
): Promise<{ lat: number; lng: number; displayName: string }> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", direccion);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  // Sesga los resultados hacia México sin excluir direcciones fuera de CDMX.
  url.searchParams.set("countrycodes", "mx");

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: {
        "User-Agent": "carpool-itam-mvp/0.1 (demo para inversionistas, ITAM)",
        "Accept-Language": "es",
      },
    });
  } catch {
    throw new GeocodingError(
      "No pudimos conectarnos al servicio de mapas. Intenta de nuevo en unos segundos."
    );
  }

  if (!respuesta.ok) {
    throw new GeocodingError(
      `El servicio de mapas respondió con un error (${respuesta.status}). Intenta de nuevo.`
    );
  }

  const resultados = (await respuesta.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
  }>;
  const primero = resultados[0];

  if (!primero) {
    throw new GeocodingError(
      "No pudimos encontrar esa dirección. Intenta ser más específico (calle, colonia, alcaldía o municipio)."
    );
  }

  return {
    lat: Number(primero.lat),
    lng: Number(primero.lon),
    // display_name es la versión normalizada de Nominatim (calle, colonia,
    // alcaldía, ciudad...) — se usa para que el usuario confirme en
    // /reserva que se entendió bien la dirección antes de publicar (ver
    // lib/actions/reserva.ts::previsualizarDireccion). Si por lo que sea no
    // viene en la respuesta, se regresa la dirección tal como se escribió.
    displayName: primero.display_name ?? direccion,
  };
}

// Distancia en línea recta entre dos puntos (fórmula de Haversine), en
// kilómetros. Se usa para el estimado de precio/ganancia en /reserva
// (distancia de la dirección escrita al campus de la institución, ver
// migración 0005_campus_institucion.sql) — es una aproximación a propósito:
// el precio final depende de con quién se empareje y de la ruta real, no de
// la distancia recta a un punto fijo.
export function distanciaHaversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const RADIO_TIERRA_KM = 6371;
  const aRadianes = (grados: number) => (grados * Math.PI) / 180;
  const dLat = aRadianes(lat2 - lat1);
  const dLng = aRadianes(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIO_TIERRA_KM * c;
}
