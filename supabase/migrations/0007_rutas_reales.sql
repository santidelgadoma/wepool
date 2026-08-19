-- 0007_rutas_reales.sql
-- Integra Google Routes API (computeRouteMatrix, ver lib/rutas.ts) para
-- tiempo/distancia de manejo REALES entre dos puntos, reemplazando el
-- estimado de línea recta (PostGIS ST_Distance) + velocidad promedio
-- constante que se usaba desde el principio (lib/pricing.ts::
-- VELOCIDAD_PROMEDIO_KMH, que se queda como fallback para cuando Google no
-- está configurado o no responde). Dos cambios de esquema:
--
-- 1. trip_offers gana lat/lng planos — mismo motivo que saved_locations en
--    0006: PostgREST no decodifica columnas `geography` (llegan como WKB
--    hexadecimal), y para llamar a la API de Google desde código de
--    servidor normal hace falta poder leer las coordenadas de vuelta sin
--    pasar por una función de Postgres cada vez.
-- 2. trip_matches gana `distance_km`: la distancia real de manejo (no la
--    línea recta) que devuelve Google, para que el precio (que se calcula
--    por distancia, ver lib/pricing.ts::estimarPrecioViaje) no tenga que
--    reconstruirse invirtiendo la duración con la velocidad promedio — eso
--    ya no sería consistente ahora que la duración guardada puede ser real
--    y no derivada de esa misma constante.

-- ─── 1. trip_offers.home_lat / home_lng ───────────────────────────────────

alter table public.trip_offers
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;

-- Backfill de las filas que ya existan (creadas antes de esta migración) —
-- se extraen directo de la columna geography que ya tenían, sin necesidad
-- de volver a geocodificar nada.
update public.trip_offers
set home_lat = ST_Y(home_location::geometry),
    home_lng = ST_X(home_location::geometry)
where home_lat is null;

alter table public.trip_offers
  alter column home_lat set not null,
  alter column home_lng set not null;

-- ─── 2. trip_matches.distance_km ──────────────────────────────────────────
-- Nullable a propósito: las filas ya existentes (o las que se creen si
-- Google no responde en su momento) se quedan en null, y lib/pricing.ts
-- sabe caer al estimado viejo cuando es null (ver precioDeMatchEmbebido).

alter table public.trip_matches
  add column if not exists distance_km numeric;

-- ─── 3. find_driver_offers_near: ahora también regresa home_lat/home_lng ──
-- (la función se creó en 0006_saved_locations.sql) — lib/actions/feed.ts
-- los necesita para llamar a Google Routes API con las coordenadas exactas
-- de cada conductor candidato, en vez de solo tener la distancia en línea
-- recta que esta función ya traía.
--
-- Nota: find_candidate_offers (0002/0004) NO necesita este mismo cambio —
-- ya regresa `setof trip_offers` completo (select o2.*), así que en cuanto
-- trip_offers tiene home_lat/home_lng, esa función los incluye sola.
--
-- `create or replace function` NO permite cambiar las columnas de salida de
-- una función que devuelve `table (...)` (error de Postgres 42P13: "cannot
-- change return type of existing function" cuando el set de columnas de
-- salida es distinto al de 0006, que no tenía home_lat/home_lng) — hay que
-- borrar la función vieja primero y volver a crearla completa.

drop function if exists public.find_driver_offers_near(
  double precision,
  double precision,
  uuid,
  timestamptz,
  timestamptz,
  numeric,
  integer
);

create or replace function public.find_driver_offers_near(
  p_lat double precision,
  p_lng double precision,
  p_institution_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_radius_km numeric default 15,
  p_limit integer default 30
)
returns table (
  id uuid,
  direction trip_direction,
  scheduled_time timestamptz,
  uses_toll_roads boolean,
  meeting_point text,
  driver_id uuid,
  driver_full_name text,
  vehicle_description text,
  home_lat double precision,
  home_lng double precision,
  distance_meters double precision
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.direction,
    o.scheduled_time,
    o.uses_toll_roads,
    o.meeting_point,
    o.user_id as driver_id,
    p.full_name as driver_full_name,
    v.description as vehicle_description,
    o.home_lat,
    o.home_lng,
    ST_Distance(
      o.home_location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) as distance_meters
  from public.trip_offers o
  join public.profiles p on p.id = o.user_id
  left join public.vehicles v on v.id = o.vehicle_id
  where o.role = 'conductor'
    and o.status = 'buscando'
    and p.institution_id = p_institution_id
    and o.scheduled_time >= p_start_time
    and o.scheduled_time < p_end_time
    and ST_DWithin(
      o.home_location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
  order by o.scheduled_time asc
  limit p_limit;
$$;

revoke execute on function public.find_driver_offers_near from authenticated, anon, public;
grant execute on function public.find_driver_offers_near to service_role;
