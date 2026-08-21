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
  // de servicio. Se pide también role/status porque, si la oferta está
  // 'pendiente' (solicitud urgente en curso, ver lib/actions/solicitudes.ts),
  // hay que avisarle a la contraparte que el viaje se cayó, no solo borrar.
  const { data: ofertaPropia } = await supabase
    .from("trip_offers")
    .select("id, role, status")
    .eq("id", offerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ofertaPropia) {
    return { error: "Esa reservación ya no existe o no te pertenece." };
  }

  const admin = createAdminClient();

  // Si esta oferta tenía una solicitud urgente en curso ('pendiente'), la
  // contraparte se queda sin viaje al cancelarla — hay que avisarle en vez
  // de solo borrar todo en silencio, igual que si el conductor hubiera
  // rechazado (mismo patrón que responderSolicitud en
  // lib/actions/solicitudes.ts).
  if (ofertaPropia.status === "pendiente") {
    const { data: matchActivo } = await admin
      .from("trip_matches")
      .select("id, driver_offer_id, passenger_offer_id")
      .or(`driver_offer_id.eq.${offerId},passenger_offer_id.eq.${offerId}`)
      .maybeSingle();

    if (matchActivo) {
      const idContraparte =
        matchActivo.driver_offer_id === offerId
          ? matchActivo.passenger_offer_id
          : matchActivo.driver_offer_id;

      if (ofertaPropia.role === "pasajero") {
        // El pasajero se arrepiente/cancela mientras esperaba respuesta — la
        // oferta del conductor queda libre de nuevo, sin ningún aviso
        // especial (no fue el conductor quien la rechazó).
        await admin.from("trip_offers").update({ status: "buscando" }).eq("id", idContraparte);
      } else {
        // El conductor cancela mientras un pasajero esperaba respuesta — desde
        // la perspectiva del pasajero es indistinguible de un rechazo, así
        // que se le avisa igual (ver obtenerEstadoPasajero).
        await admin.from("trip_offers").update({ status: "rechazado" }).eq("id", idContraparte);
      }
    }
  }

  // Si ya se había calculado un candidato para esta oferta (trip_matches),
  // hay que borrarlo antes de borrar la oferta — si no, el delete de abajo
  // revienta por violación de llave foránea (mismo bug que se encontró en
  // elegirCandidato, ver PROGRESS.md). Se usa el cliente con llave de
  // servicio porque trip_matches está restringido a service_role.
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
  revalidatePath("/home");
  revalidatePath("/consultar");
  return {};
}
