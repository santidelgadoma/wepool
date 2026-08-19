-- 0006_saved_locations.sql
-- Ubicaciones guardadas por usuario para el feed tipo Rappi/BlaBlaCar del
-- home (ver PROGRESS.md, "Rediseño del home — feed de viajes"): en vez de
-- que cada pasajero tenga que escribir/geocodificar su dirección cada vez
-- que busca viaje (como hoy en /reserva), guarda hasta 3 ubicaciones fijas
-- -- Casa/Oficina/Otro, set fijo, decisión de producto del 2026-08-18 -- y
-- las reusa para filtrar el feed por cercanía.
--
-- Se guardan lat/lng en columnas planas ADEMÁS de la columna geography:
-- PostgREST no expone de forma legible las columnas geography (llegan como
-- WKB hexadecimal, ver 0003_matching_helpers.sql), y aquí sí necesitamos
-- leer las coordenadas de vuelta desde código de servidor normal (para
-- pasarlas como parámetros a find_driver_offers_near más abajo), así que no
-- basta con solo la columna geography como en trip_offers.

create table public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('casa', 'oficina', 'otro')),
  address_text text not null,
  lat double precision not null,
  lng double precision not null,
  location geography(Point, 4326) not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

create index saved_locations_location_idx on public.saved_locations using gist (location);

comment on table public.saved_locations is
  'Hasta 3 ubicaciones fijas por usuario (casa/oficina/otro) para filtrar el feed de viajes del home por cercanía. No son parte de trip_offers -- solo sirven para buscar, no para publicar un viaje.';

alter table public.saved_locations enable row level security;

-- Mismo patrón que vehicles: cada quien administra únicamente las suyas, sin
-- necesidad de pasar por el cliente admin para leer/escribir las propias.
create policy "owner manages own saved locations" on public.saved_locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── find_driver_offers_near: feed de ofertas de conductor cerca de un punto ──
-- Análoga a find_candidate_offers (0002_functions.sql), pero parte de un
-- punto arbitrario (una ubicación guardada) en vez de una trip_offer propia
-- -- el pasajero todavía no tiene ninguna oferta publicada cuando navega el
-- feed, a diferencia del flujo viejo de /consultar. Restringida a
-- service_role por la misma razón que find_candidate_offers: aunque NO
-- expone home_address/home_location exactos de los conductores (solo
-- distance_meters, ya calculada en el servidor), sí expone su nombre y
-- vehículo -- una concesión deliberada de producto para que el feed se
-- sienta como el de una plataforma real (BlaBlaCar/Uber muestran esto antes
-- de reservar), documentada en PROGRESS.md.

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
