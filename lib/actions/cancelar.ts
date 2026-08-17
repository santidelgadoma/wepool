"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CancelarOfertaState = { error?: string };

export async function cancelarOferta(offerId: string): Promise<CancelarOfertaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo." };
  }

  // La política RLS "owner manages own offers" ya impide borrar ofertas de
  // alguien más; el filtro por user_id aquí es una segunda barrera explícita.
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
