-- 0001_init_schema.sql
-- Esquema inicial: extensiones, tipos, tablas, índices y Row Level Security.
-- Carpool ITAM — ver docs/esquema_base_datos.md para el detalle de cada decisión.

-- ─── Extensiones ────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists postgis;      -- tipos y funciones geoespaciales
create extension if not exists pg_cron;      -- tareas programadas (limpieza de reservas vencidas)

-- ─── Tipos enumerados ───────────────────────────────────────────────────────

create type trip_direction as enum ('ida', 'regreso');
create type trip_role as enum ('conductor', 'pasajero');
create type trip_offer_status as enum ('buscando', 'confirmado', 'cancelado', 'expirado');
create type confirmed_trip_status as enum ('programado', 'completado', 'cancelado');

-- ─── profiles ───────────────────────────────────────────────────────────────
-- Extiende auth.users (Supabase Auth ya guarda correo institucional + contraseña con bcrypt).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Datos de perfil por usuario. El correo institucional y la contraseña viven en auth.users.';

-- ─── vehicles ───────────────────────────────────────────────────────────────

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  plate text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index vehicles_owner_id_idx on public.vehicles (owner_id);

-- ─── trip_offers ────────────────────────────────────────────────────────────
-- Reemplaza las 4 tablas de reservación de la tesina
-- (Viajes_Ida_Pasajero, Viajes_Ida_Conductor, Viajes_Regreso_Conductor, Viajes_Regreso_Pasajero)
-- en una sola tabla distinguida por direction/role.
--
-- home_address / home_location siempre describen el extremo variable del viaje:
--   direction = 'ida'     -> dirección de origen (el ITAM es el destino fijo)
--   direction = 'regreso' -> dirección de destino (el ITAM es el origen fijo)

create table public.trip_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  direction trip_direction not null,
  role trip_role not null,
  vehicle_id uuid references public.vehicles (id),
  home_address text not null,
  home_location geography(Point, 4326) not null,
  scheduled_time timestamptz not null,
  uses_toll_roads boolean,
  meeting_point text,
  status trip_offer_status not null default 'buscando',
  created_at timestamptz not null default now(),

  constraint driver_requires_vehicle
    check (role <> 'conductor' or vehicle_id is not null),
  constraint passenger_has_no_vehicle
    check (role <> 'pasajero' or vehicle_id is null),
  constraint driver_states_toll_preference
    check (role <> 'conductor' or uses_toll_roads is not null),
  constraint driver_regreso_requires_meeting_point
    check (not (role = 'conductor' and direction = 'regreso') or meeting_point is not null)
);

-- Índice espacial para búsquedas de "vecino más cercano" (ORDER BY home_location <-> punto)
create index trip_offers_location_idx on public.trip_offers using gist (home_location);
-- Índice para el pre-filtro por dirección/rol/estatus/horario antes de la búsqueda geoespacial
create index trip_offers_search_idx on public.trip_offers (direction, role, status, scheduled_time);

comment on table public.trip_offers is
  'Ofertas de viaje (conductor u pasajero, ida o regreso). Reemplaza las 4 tablas de reservación de la tesina.';

-- ─── trip_matches ───────────────────────────────────────────────────────────
-- Reemplaza Viajes_Asignados_Ida / Viajes_Asignados_Regreso.

create table public.trip_matches (
  id uuid primary key default gen_random_uuid(),
  driver_offer_id uuid not null references public.trip_offers (id) on delete cascade,
  passenger_offer_id uuid not null references public.trip_offers (id) on delete cascade,
  estimated_duration_minutes integer not null,
  passenger_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (driver_offer_id, passenger_offer_id)
);

create index trip_matches_driver_idx on public.trip_matches (driver_offer_id);
create index trip_matches_passenger_idx on public.trip_matches (passenger_offer_id);

-- ─── confirmed_trips ────────────────────────────────────────────────────────
-- Reemplaza la tabla Viajes (historial) de la tesina.

create table public.confirmed_trips (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.trip_matches (id),
  driver_id uuid not null references public.profiles (id),
  passenger_id uuid not null references public.profiles (id),
  direction trip_direction not null,
  vehicle_id uuid not null references public.vehicles (id),
  home_address text not null,
  scheduled_time timestamptz not null,
  meeting_point text,
  calendar_event_id text,
  status confirmed_trip_status not null default 'programado',
  created_at timestamptz not null default now()
);

create index confirmed_trips_driver_idx on public.confirmed_trips (driver_id);
create index confirmed_trips_passenger_idx on public.confirmed_trips (passenger_id);

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.trip_offers enable row level security;
alter table public.trip_matches enable row level security;
alter table public.confirmed_trips enable row level security;

-- profiles: cada quien ve/edita su propio perfil; además puede ver el perfil
-- de su contraparte una vez que un viaje está confirmado (para mostrar contacto).
create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "select matched profile" on public.profiles
  for select using (
    exists (
      select 1 from public.confirmed_trips ct
      where (ct.driver_id = auth.uid() and ct.passenger_id = profiles.id)
         or (ct.passenger_id = auth.uid() and ct.driver_id = profiles.id)
    )
  );

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- vehicles: el dueño administra sus vehículos; el pasajero de un viaje
-- confirmado puede ver los datos del vehículo del conductor.
create policy "owner manages vehicle" on public.vehicles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "select matched vehicle" on public.vehicles
  for select using (
    exists (
      select 1 from public.confirmed_trips ct
      where ct.vehicle_id = vehicles.id and ct.passenger_id = auth.uid()
    )
  );

-- trip_offers: cada quien administra únicamente sus propias ofertas.
-- Los candidatos de otros usuarios NUNCA se leen directo de esta tabla desde
-- el navegador — se obtienen a través de la función find_candidate_offers()
-- (ver 0002_functions.sql), que corre en el servidor con permisos elevados.
create policy "owner manages own offers" on public.trip_offers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- trip_matches: visibles solo para los dos usuarios involucrados.
create policy "involved users see match" on public.trip_matches
  for select using (
    exists (select 1 from public.trip_offers o where o.id = driver_offer_id and o.user_id = auth.uid())
    or exists (select 1 from public.trip_offers o where o.id = passenger_offer_id and o.user_id = auth.uid())
  );

create policy "passenger confirms match" on public.trip_matches
  for update using (
    exists (select 1 from public.trip_offers o where o.id = passenger_offer_id and o.user_id = auth.uid())
  );

-- confirmed_trips: visibles solo para conductor y pasajero del viaje.
create policy "involved users see confirmed trip" on public.confirmed_trips
  for select using (auth.uid() = driver_id or auth.uid() = passenger_id);
