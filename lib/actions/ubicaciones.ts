"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodificarDireccion, GeocodingError } from "@/lib/geocoding";

export type UbicacionGuardada = {
  id: string;
  kind: "casa" | "oficina" | "otro";
  addressText: string;
  lat: number;
  lng: number;
};

// Hasta 3 ubicaciones fijas por usuario (ver
// supabase/migrations/0006_saved_locations.sql) para el feed del home. Se
// leen con el cliente normal (RLS: "owner manages own saved locations",
// igual que vehicles) -- no hace falta el cliente admin porque cada quien
// solo puede leer/escribir las suyas.
export async function listarUbicaciones(): Promise<UbicacionGuardada[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("saved_locations")
    .select("id, kind, address_text, lat, lng")
    .eq("user_id", user.id);

  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    kind: fila.kind as "casa" | "oficina" | "otro",
    addressText: fila.address_text as string,
    lat: fila.lat as number,
    lng: fila.lng as number,
  }));
}

export type GuardarUbicacionState = { error?: string; success?: boolean };

// Geocodifica y guarda (o reemplaza) la ubicación de un tipo fijo
// (casa/oficina/otro) para el usuario actual. Usa upsert sobre el unique
// (user_id, kind) definido en la migración -- "cambiar dirección" desde el
// home es simplemente volver a guardar el mismo kind.
export async function guardarUbicacion(
  _estadoPrevio: GuardarUbicacionState,
  formData: FormData
): Promise<GuardarUbicacionState> {
  const kind = formData.get("kind");
  const address = String(formData.get("address") ?? "").trim();

  if (kind !== "casa" && kind !== "oficina" && kind !== "otro") {
    return { error: "Ubicación inválida." };
  }
  if (address.length < 5) {
    return { error: "Escribe una dirección más completa." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  let coordenadas: { lat: number; lng: number };
  try {
    coordenadas = await geocodificarDireccion(address);
  } catch (err) {
    const mensaje =
      err instanceof GeocodingError ? err.message : "No pudimos ubicar esa dirección.";
    return { error: mensaje };
  }

  const { error } = await supabase.from("saved_locations").upsert(
    {
      user_id: user.id,
      kind,
      address_text: address,
      lat: coordenadas.lat,
      lng: coordenadas.lng,
      location: `POINT(${coordenadas.lng} ${coordenadas.lat})`,
    },
    { onConflict: "user_id,kind" }
  );

  if (error) {
    return { error: `No se pudo guardar la ubicación: ${error.message}` };
  }

  revalidatePath("/home");
  return { success: true };
}
