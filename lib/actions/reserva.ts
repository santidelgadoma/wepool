"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { geocodificarDireccion, GeocodingError } from "@/lib/geocoding";
import { datetimeLocalCDMXaUTC, fechaDeMananaCDMX } from "@/lib/datetime";

const ofertaSchema = z
  .object({
    role: z.enum(["conductor", "pasajero"]),
    direction: z.enum(["ida", "regreso"]),
    homeAddress: z.string().trim().min(5, "Escribe una dirección más completa."),
    scheduledTime: z
      .string()
      .min(1, "Elige la hora del viaje.")
      .refine((valor) => valor.slice(0, 10) === fechaDeMananaCDMX(), {
        message: "Los viajes solo se pueden reservar para mañana.",
      }),
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

  let coordenadas: { lat: number; lng: number };
  try {
    coordenadas = await geocodificarDireccion(datos.homeAddress);
  } catch (err) {
    const mensaje =
      err instanceof GeocodingError ? err.message : "No se pudo ubicar esa dirección.";
    return { fieldErrors: { homeAddress: mensaje } };
  }

  const { error: errorOferta } = await supabase.from("trip_offers").insert({
    user_id: user.id,
    direction: datos.direction,
    role: datos.role,
    vehicle_id: datos.role === "conductor" ? vehicleId : null,
    home_address: datos.homeAddress,
    home_location: `POINT(${coordenadas.lng} ${coordenadas.lat})`,
    scheduled_time: datetimeLocalCDMXaUTC(datos.scheduledTime).toISOString(),
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
