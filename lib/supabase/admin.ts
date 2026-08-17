import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";

// Cliente de Supabase con la llave de servicio — salta Row Level Security
// por completo. SOLO se debe usar desde código que corre en el servidor
// (Server Actions / Route Handlers) y que ya validó "a mano" que el usuario
// autenticado tiene permiso sobre los datos que va a leer o escribir (ver
// lib/actions/consultar.ts para el patrón). Nunca importar esto desde un
// componente "use client", y nunca exponer SUPABASE_SERVICE_ROLE_KEY con el
// prefijo NEXT_PUBLIC_ — eso la mandaría al navegador.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // @supabase/supabase-js crea un RealtimeClient internamente aunque no
      // usemos realtime, y desde una versión reciente exige `WebSocket`
      // nativo (Node 22+) o falla con "native WebSocket not found". No
      // dependemos de qué versión de Node corre `npm run dev` en cada
      // máquina, así que se le pasa `ws` explícitamente — funciona igual en
      // cualquier versión de Node.
      realtime: { transport: WebSocket as never },
    }
  );
}
