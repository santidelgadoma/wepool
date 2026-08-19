"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { geocodificarDireccion, GeocodingError, distanciaHaversineKm } from "@/lib/geocoding";
import { estimarPrecioViaje } from "@/lib/pricing";
import { datetimeLocalCDMXaUTC, fechaDeMananaCDMX } from "@/lib/datetime";

// Antes este campo era un <input type="datetime-local"> completo y se
// validaba que la fecha fuera exactamente "mañana". Ahora el formulario solo
// pide la hora (la fecha siempre es mañana, no tiene caso hacer que el
// usuario navegue un calendario para algo que no puede cambiar) — el
// servidor arma la fecha completa él mismo con fechaDeMananaCDMX() más abajo,
// así que ya no hace falta (ni es posible) que el cliente mande una fecha
// equivocada.
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const ofertaSchema = z
  .object({
    role: z.enum(["conductor", "pasajero"]),
    direction: z.enum(["ida", "regreso"]),
    homeAddress: z.string().trim().min(5, "Escribe una dirección más completa."),
    scheduledTime: z.string().regex(HORA_REGEX, "Elige una hora válida."),
    vehicleId: z.string().uuid().optional(),
    newVehiclePlate: z.string().trim().optional(),
    newVehicleDescription: z.string().trim().optional(),
    usesTollRoads: z.boolean().optional(),
    meetingPoint: z.string().trim().optional(),
  })
  .superRefine((datos, ctx) => {
    if (datos.role === "conductor") {
      if (datos.usesTollRoads === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica si usas vías de cuota.",
          path: ["usesTollRoads"],
        });
      }
      const tieneVehiculoExistente = Boolean(datos.vehicleId);
      const tieneVehiculoNuevo = Boolean(
        datos.newVehiclePlate && datos.newVehicleDescription
      );
      if (!tieneVehiculoExistente && !tieneVehiculoNuevo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecciona un vehículo o registra uno nuevo (placas y descripción).",
          path: ["vehicleId"],
        });
      }
      if (datos.direction === "regreso" && !datos.meetingPoint) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Como conductor de regreso debes indicar un punto de encuentro en el campus.",
          path: ["meetingPoint"],
        });
      }
    } else if (datos.vehicleId || datos.newVehiclePlate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Los pasajeros no registran vehículo.",
        path: ["vehicleId"],
      });
    }
  });

export type CrearOfertaState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function crearOferta(
  _estadoPrevio: CrearOfertaState,
  formData: FormData
): Promise<CrearOfertaState> {
  const esConductor = formData.get("role") === "conductor";

  const crudo = {
    role: formData.get("role"),
    direction: formData.get("direction"),
    homeAddress: formData.get("homeAddress"),
    scheduledTime: formData.get("scheduledTime"),
    vehicleId: formData.get("vehicleId") || undefined,
    newVehiclePlate: formData.get("newVehiclePlate") || undefined,
    newVehicleDescription: formData.get("newVehicleDescription") || undefined,
    usesTollRoads: esConductor ? formData.get("usesTollRoads") === "true" : undefined,
    meetingPoint: formData.get("meetingPoint") || undefined,
  };

  const parseo = ofertaSchema.safeParse(crudo);
  if (!parseo.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parseo.error.issues) {
      const campo = String(issue.path[0] ?? "form");
      if (!fieldErrors[campo]) fieldErrors[campo] = issue.message;
    }
    return { fieldErrors };
  }

  const datos = parseo.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo." };
  }

  let vehicleId: string | null = datos.vehicleId ?? null;

  if (datos.role === "conductor" && !vehicleId) {
    const { data: vehiculoNuevo, error: errorVehiculo } = await supabase
      .from("vehicles")
      .insert({
        owner_id: user.id,
        plate: datos.newVehiclePlate!,
        description: datos.newVehicleDescription!,
      })
      .select("id")
      .single();

    if (errorVehiculo || !vehiculoNuevo) {
      return {
        error: `No se pudo registrar el vehículo: ${errorVehiculo?.message ?? "error desconocido"}`,
      };
    }
    vehicleId = vehiculoNuevo.id as string;
  }

  // Si el formulario ya verificó esta dirección en vivo (ver
  // previsualizarDireccion abajo, usado por components/reserva-form.tsx al
  // salir del campo de dirección), reutilizamos esas coordenadas en vez de
  // volver a geocodificar — evita duplicar la llamada a Nominatim (límite de
  // ~1 req/seg) en el camino más común. Si el usuario editó la dirección
  // después de la verificación (o si JS estaba deshabilitado, o la
  // verificación falló), `previewFor` no va a coincidir con la dirección
  // final y se cae al geocoding normal de siempre.
  const previewFor = String(formData.get("previewFor") ?? "");
  const previewLat = Number(formData.get("previewLat"));
  const previewLng = Number(formData.get("previewLng"));
  const previewValido =
    previewFor === datos.homeAddress &&
    Number.isFinite(previewLat) &&
    Number.isFinite(previewLng);

  let coordenadas: { lat: number; lng: number };
  if (previewValido) {
    coordenadas = { lat: previewLat, lng: previewLng };
  } else {
    try {
      coordenadas = await geocodificarDireccion(datos.homeAddress);
    } catch (err) {
      const mensaje =
        err instanceof GeocodingError ? err.message : "No se pudo ubicar esa dirección.";
      return { fieldErrors: { homeAddress: mensaje } };
    }
  }

  const scheduledDateTimeLocal = `${fechaDeMananaCDMX()}T${datos.scheduledTime}`;

  const { error: errorOferta } = await supabase.from("trip_offers").insert({
    user_id: user.id,
    direction: datos.direction,
    role: datos.role,
    vehicle_id: datos.role === "conductor" ? vehicleId : null,
    home_address: datos.homeAddress,
    home_location: `POINT(${coordenadas.lng} ${coordenadas.lat})`,
    // lat/lng planos además de home_location (ver
    // 0007_rutas_reales.sql) -- lib/rutas.ts los necesita para llamar a
    // Google Routes API sin tener que decodificar la columna geography.
    home_lat: coordenadas.lat,
    home_lng: coordenadas.lng,
    scheduled_time: datetimeLocalCDMXaUTC(scheduledDateTimeLocal).toISOString(),
    uses_toll_roads: datos.role === "conductor" ? datos.usesTollRoads : null,
    meeting_point:
      datos.role === "conductor" && datos.direction === "regreso"
        ? datos.meetingPoint
        : null,
  });

  if (errorOferta) {
    return { error: `No se pudo publicar el viaje: ${errorOferta.message}` };
  }

  revalidatePath("/reserva");
  revalidatePath("/cancelar");
  return { success: true };
}

// ─── Previsualización de dirección (en vivo, antes de publicar) ────────────
// Se llama desde components/reserva-form.tsx al salir del campo de
// dirección (blur, no en cada tecla — respeta el límite de ~1 req/seg de
// Nominatim). Sirve dos cosas a la vez con la misma llamada de geocoding:
// (1) confirmar que WEPOOL entendió bien la dirección ANTES de publicar, en
// vez de que el usuario se entere hasta después de dar clic en "Publicar
// viaje"; (2) si la institución tiene coordenadas de campus (ver migración
// 0005_campus_institucion.sql), mostrar un estimado de precio/ganancia ya en
// este formulario — hoy ese número solo se veía hasta que había un match real
// en /consultar.
export type PreviewDireccion =
  | {
      ok: true;
      displayName: string;
      lat: number;
      lng: number;
      distanciaKm?: number;
      precioPasajeroMXN?: number;
      gananciaConductorMXN?: number;
    }
  | { ok: false; error: string };

export async function previsualizarDireccion(
  direccion: string,
  campus: { lat: number; lng: number } | null
): Promise<PreviewDireccion> {
  const limpia = direccion.trim();
  if (limpia.length < 5) {
    return { ok: false, error: "Escribe una dirección más completa." };
  }

  try {
    const { lat, lng, displayName } = await geocodificarDireccion(limpia);

    if (!campus) {
      // La institución del usuario no tiene coordenadas de campus cargadas
      // todavía — se puede seguir confirmando la dirección, solo no hay con
      // qué calcular una distancia/precio estimados.
      return { ok: true, displayName, lat, lng };
    }

    const distanciaKm = distanciaHaversineKm(lat, lng, campus.lat, campus.lng);
    const { precioPasajeroMXN, gananciaConductorMXN } = estimarPrecioViaje(distanciaKm);
    return { ok: true, displayName, lat, lng, distanciaKm, precioPasajeroMXN, gananciaConductorMXN };
  } catch (err) {
    const mensaje =
      err instanceof GeocodingError ? err.message : "No pudimos ubicar esa dirección.";
    return { ok: false, error: mensaje };
  }
}
