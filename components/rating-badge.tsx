import { Star } from "lucide-react";

// Badge chico "★ 4.8 (12)" -- usa profiles.rating_avg/rating_count (ver
// supabase/migrations/0011_calificaciones.sql), leídos directo con el
// cliente normal en las pantallas donde ya hay match (app/(app)/manana,
// app/(app)/historial -- la política "select matched profile" de
// 0001_init_schema.sql ya permite leer esas dos columnas del perfil de la
// contraparte). No mostrar nada si rating_count es 0 -- un "★ 0.0" para un
// usuario nuevo sin calificaciones se ve como una calificación mala, no como
// "todavía no tiene".
export function RatingBadge({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {avg.toFixed(1)} ({count})
    </span>
  );
}
