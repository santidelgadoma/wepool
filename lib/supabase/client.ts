import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para Client Components ("use client").
 * Usa las llaves públicas (NEXT_PUBLIC_*) — seguras de exponer en el navegador,
 * la seguridad real la dan las políticas de Row Level Security en Postgres.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
