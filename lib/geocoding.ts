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
): Promise<{ lat: number; lng: number }> {
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

  const resultados = (await respuesta.json()) as Array<{ lat: string; lon: string }>;
  const primero = resultados[0];

  if (!primero) {
    throw new GeocodingError(
      "No pudimos encontrar esa dirección. Intenta ser más específico (calle, colonia, alcaldía o municipio)."
    );
  }

  return { lat: Number(primero.lat), lng: Number(primero.lon) };
}
