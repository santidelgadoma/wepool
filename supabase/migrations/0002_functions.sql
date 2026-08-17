-- 0002_functions.sql
-- Funciones de negocio: creación automática de perfil, restricción de dominio
-- institucional, emparejamiento geoespacial y limpieza de reservas vencidas.

-- ─── 1. Crear el perfil automáticamente cuando Supabase Auth confirma el registro ──
-- Sustituye el paso manual de la tesina ("el sistema crea un registro en la
-- tabla de usuarios" después de validar el código de 6 dígitos).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 2. Restringir el registro a correos institucionales (@itam.mx) ──────────
-- Se conecta como "Before User Created" hook desde Auth > Hooks en el panel
-- de Supabase (o vía `auth.hook.before_user_created` en supabase/config.toml
-- para desarrollo local). Referencia:
-- https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook

create or replace function public.restrict_signup_to_itam_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text;
  domain text;
begin
  user_email := event -> 'user' ->> 'email';
  domain := split_part(coalesce(user_email, ''), '@', 2);

  if domain is null or lower(domain) <> 'itam.mx' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Solo se permite registro con correo institucional @itam.mx',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.restrict_signup_to_itam_domain to supabase_auth_admin;
revoke execute on function public.restrict_signup_to_itam_domain from authenticated, anon, public;

-- ─── 3. Pre-filtro geoespacial de candidatos compatibles ─────────────────────
-- Reemplaza el ciclo de la tesina que llamaba a Distance Matrix por cada par
-- de reservaciones. Aquí Postgres/PostGIS descarta primero por dirección,
-- rol, estatus, ventana de horario y cercanía geográfica (índice GiST), y
-- solo los ~N candidatos más cercanos se mandan después a la API de Google
-- Distance Matrix (desde el servidor) para confirmar el desvío real.
--
-- IMPORTANTE: esta función expone home_location/home_address de otros
-- usuarios, así que solo debe poder ejecutarse desde el servidor (rol
-- service_role dentro de un Server Action de Next.js), nunca desde el
-- navegador con la llave anónima — de lo contrario cualquier usuario
-- autenticado podría sondear ubicaciones exactas antes de que exista un
-- viaje confirmado.

create or replace function public.find_candidate_offers(
  p_offer_id uuid,
  p_radius_km numeric default 15,
  p_time_window_minutes integer default 30,
  p_limit integer default 20
)
returns setof public.trip_offers
language sql
security definer
set search_path = public
as $$
  select o2.*
  from public.trip_offers o1
  join public.trip_offers o2
    on o2.direction = o1.direction
   and o2.role <> o1.role
   and o2.status = 'buscando'
   and o2.id <> o1.id
   and abs(extract(epoch from (o2.scheduled_time - o1.scheduled_time))) <= (p_time_window_minutes * 60)
   and ST_DWithin(o1.home_location, o2.home_location, p_radius_km * 1000)
  where o1.id = p_offer_id
  order by o1.home_location <-> o2.home_location
  limit p_limit;
$$;

revoke execute on function public.find_candidate_offers from authenticated, anon, public;
grant execute on function public.find_candidate_offers to service_role;

-- ─── 4. Limpieza automática de reservas vencidas ─────────────────────────────
-- Reemplaza el hilo de Python (`coordinar_reservas`) de la tesina, que vivía
-- en memoria del proceso y se perdía si el servidor se reiniciaba. pg_cron
-- corre dentro de la base de datos, así que no depende de ningún servidor.

create or replace function public.expire_stale_offers()
returns void
language sql
as $$
  update public.trip_offers
  set status = 'expirado'
  where status = 'buscando'
    and scheduled_time < now();
$$;

-- Corre cada 15 minutos. Ajustar el schedule si el negocio lo requiere.
select cron.schedule(
  'expire-stale-trip-offers',
  '*/15 * * * *',
  $$ select public.expire_stale_offers(); $$
);
