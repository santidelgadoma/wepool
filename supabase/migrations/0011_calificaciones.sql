-- 0011_calificaciones.sql
-- Calificaciones mutuas conductor/pasajero por viaje confirmado + el
-- mecanismo que faltaba para marcar un viaje como completado (ver
-- docs/diseno_chat_y_calificaciones.md sección B, decisiones confirmadas con
-- el usuario el 27 de agosto de 2026: calificación EDITABLE, comentarios
-- PÚBLICOS a cualquier usuario autenticado (no solo rater/ratee), y
-- calificación OBLIGATORIA con bloqueo real antes de reservar/unirse a un
-- viaje nuevo -- ver lib/actions/calificaciones.ts).

-- ─── B.1: marcar viajes como completado ─────────────────────────────────────
-- Nada en el código ponía confirmed_trips.status = 'completado' hasta ahora
-- -- todo se quedaba en 'programado' para siempre. Mismo mecanismo de
-- pg_cron que ya limpia trip_offers vencidas (0002_functions.sql). El
-- colchón de 3 horas es arbitrario -- ajustar si los viajes reales duran
-- más.

create or replace function public.complete_past_confirmed_trips()
returns void
language sql
as $$
  update public.confirmed_trips
  set status = 'completado'
  where status = 'programado'
    and scheduled_time < now() - interval '3 hours';
$$;

select cron.schedule(
  'complete-past-confirmed-trips',
  '*/15 * * * *',
  $$ select public.complete_past_confirmed_trips(); $$
);

-- ─── Anti-colusión: máximo 2 viajes confirmados por par de usuarios por día ─
-- Sin pagos reales en la app (ver lib/pricing.ts -- el precio mostrado es
-- solo un estimado, el dinero se arregla entre las dos personas fuera de
-- WEPOOL), la única forma de "fabricar" una calificación falsa es que dos
-- cuentas reales (correo institucional verificado) se pongan de acuerdo para
-- confirmar viajes que nunca ocurrieron. No se puede eliminar ese riesgo sin
-- pagos reales o verificación de identidad -- ninguno de los dos existe hoy
-- -- pero sí se puede subir el costo de explotarlo: un par de usuarios
-- legítimos como mucho confirma 2 viajes el mismo día (ida y regreso); un
-- tercer viaje confirmado ese mismo día entre el mismo par ya es sospechoso
-- y se bloquea aquí, a nivel de base de datos, sin importar por cuál Server
-- Action se intente crear (hoy solo responderSolicitud en
-- lib/actions/solicitudes.ts inserta en confirmed_trips, pero un trigger
-- BEFORE INSERT cubre también cualquier camino futuro).

create or replace function public.limitar_viajes_confirmados_por_dia()
returns trigger
language plpgsql
as $$
declare
  viajes_ese_dia integer;
begin
  select count(*) into viajes_ese_dia
  from public.confirmed_trips ct
  where ct.driver_id = new.driver_id
    and ct.passenger_id = new.passenger_id
    and (ct.scheduled_time at time zone 'America/Mexico_City')::date
      = (new.scheduled_time at time zone 'America/Mexico_City')::date;

  if viajes_ese_dia >= 2 then
    raise exception
      'Ya existen % viajes confirmados entre estos dos usuarios ese día (máximo 2, ida y regreso).',
      viajes_ese_dia;
  end if;

  return new;
end;
$$;

drop trigger if exists confirmed_trips_limitar_por_dia on public.confirmed_trips;

create trigger confirmed_trips_limitar_por_dia
before insert on public.confirmed_trips
for each row
execute function public.limitar_viajes_confirmados_por_dia();

-- ─── B.2: tabla trip_ratings ─────────────────────────────────────────────
-- `stars` es NULLABLE a propósito -- una fila es una calificación real
-- (stars 1-5, no_show = false) O un reporte de "esto no ocurrió" (stars
-- null, no_show = true), nunca las dos cosas a la vez (ver el check
-- stars_xor_no_show). La opción no_show existe para que el bloqueo por
-- calificación obligatoria (ver lib/actions/calificaciones.ts) no atrape a
-- nadie calificando un viaje fantasma que nunca ocurrió.

create table public.trip_ratings (
  id uuid primary key default gen_random_uuid(),
  confirmed_trip_id uuid not null references public.confirmed_trips (id) on delete cascade,
  rater_id uuid not null references public.profiles (id),
  ratee_id uuid not null references public.profiles (id),
  stars smallint check (stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  no_show boolean not null default false,
  created_at timestamptz not null default now(),

  constraint rater_and_ratee_differ check (rater_id <> ratee_id),
  constraint stars_xor_no_show check (
    (no_show = false and stars is not null) or (no_show = true and stars is null)
  ),
  constraint one_rating_per_trip_per_rater unique (confirmed_trip_id, rater_id)
);

create index trip_ratings_ratee_idx on public.trip_ratings (ratee_id);

-- ─── B.3: RLS ─────────────────────────────────────────────────────────────
-- select es pública para cualquier usuario AUTENTICADO de la plataforma (no
-- solo rater/ratee) -- decisión confirmada: los comentarios son públicos, no
-- privados. Nota: esto expone comentarios de cualquier institución a
-- cualquier otra (WEPOOL es multi-institucional, ver PROGRESS.md "Modelo de
-- negocio") -- no hay hoy ninguna forma de navegar entre instituciones desde
-- la UI, así que en la práctica no importa, pero queda documentado por si se
-- vuelve relevante más adelante. insert/update comparten la misma condición
-- (usuario es el rater Y es parte del viaje Y el viaje está completado) --
-- calificación editable a propósito (decisión confirmada), de ahí la
-- política de update, que no existía en el diseño original de este
-- documento.

alter table public.trip_ratings enable row level security;

create policy "involved users insert rating" on public.trip_ratings
  for insert with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.confirmed_trips ct
      where ct.id = confirmed_trip_id
        and ct.status = 'completado'
        and ((ct.driver_id = auth.uid() and ct.passenger_id = ratee_id)
          or (ct.passenger_id = auth.uid() and ct.driver_id = ratee_id))
    )
  );

create policy "rater updates own rating" on public.trip_ratings
  for update using (rater_id = auth.uid())
  with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.confirmed_trips ct
      where ct.id = confirmed_trip_id
        and ct.status = 'completado'
        and ((ct.driver_id = auth.uid() and ct.passenger_id = ratee_id)
          or (ct.passenger_id = auth.uid() and ct.driver_id = ratee_id))
    )
  );

create policy "any authenticated user reads ratings" on public.trip_ratings
  for select to authenticated using (true);

-- ─── B.4: promedio/conteo denormalizado en profiles ────────────────────────
-- rating_count usa count(stars), NO count(*) -- así las filas no_show (stars
-- null) no inflan el conteo ni ensucian el promedio de nadie. El trigger
-- corre en insert Y en update (antes solo insert, en el diseño original) --
-- ahora la calificación es editable, así que cambiar de 4 a 5 estrellas, o
-- de estrellas a no_show, también debe recalcular el agregado.

alter table public.profiles
  add column rating_avg numeric(2,1),
  add column rating_count integer not null default 0;

create or replace function public.actualizar_rating_agregado()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  update public.profiles
  set rating_count = sub.cnt,
      rating_avg = sub.avg
  from (
    select ratee_id, count(stars) as cnt, round(avg(stars)::numeric, 1) as avg
    from public.trip_ratings
    where ratee_id = new.ratee_id
    group by ratee_id
  ) sub
  where profiles.id = sub.ratee_id;
  return new;
end;
$$;

drop trigger if exists trip_ratings_actualizar_agregado on public.trip_ratings;

create trigger trip_ratings_actualizar_agregado
after insert or update on public.trip_ratings
for each row
execute function public.actualizar_rating_agregado();
