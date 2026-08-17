"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CancelarOfertaState = { error?: string };

export async function cancelarOferta(offerId: string): Promise<CancelarOfertaState> {
  try {
    return await cancelarOfertaInterno(offerId);
  } catch (err) {
    console.error("cancelarOferta: excepción no controlada", err);
    return { error: "Ocurrió un error inesperado al cancelar." };
  }
}

async function cancelarOfertaInterno(offerId: string): Promise<CancelarOfertaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo." };
  }

  // Primero se confirma que la oferta es del usuario (RLS + este filtro
  // explícito son la barrera de permisos) antes de tocar nada con la llave
  // de servicio.
  const { data: ofertaPropia } = await supabase
    .from("trip_offers")
    .select("id")
    .eq("id", offerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ofertaPropia) {
    return { error: "Esa reservación ya no existe o no te pertenece." };
  }

  // Si ya se había calculado un candidato para esta oferta (trip_matches),
  // hay que borrarlo antes de borrar la oferta — si no, el delete de abajo
  // revienta por violación de llave foránea (mismo bug que se encontró en
  // elegirCandidato, ver PROGRESS.md). Se usa el cliente con llave de
  // servicio porque trip_matches está restringido a service_role.
  const admin = createAdminClient();
  const { error: errorLimpiezaMatches } = await admin
    .from("trip_matches")
    .delete()
    .or(`driver_offer_id.eq.${offerId},passenger_offer_id.eq.${offerId}`);

  if (errorLimpiezaMatches) {
    console.error("cancelarOferta: no se pudieron limpiar trip_matches", errorLimpiezaMatches);
  }

  const { error } = await supabase
    .from("trip_offers")
    .delete()
    .eq("id", offerId)
    .eq("user_id", user.id);

  if (error) {
    return { error: `No se pudo cancelar la reservación: ${error.message}` };
  }

  revalidatePath("/cancelar");
  return {};
}
