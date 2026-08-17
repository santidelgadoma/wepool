-- 0004_instituciones.sql
-- Generaliza la restricción de dominio institucional: en vez de un solo
-- dominio hardcodeado (@itam.mx), ahora hay una tabla `institutions` con la
-- lista de instituciones cliente y su dominio de correo. El ITAM queda como
-- la primera institución (el piloto), pero el modelo de negocio real es
-- vender esto como servicio a cualquier empresa/institución que quiera
-- conectar a su gente por este medio de transporte — ver PROGRESS.md,
-- sección "Modelo de negocio / pitch".
--
-- También cierra un hueco de correctitud que no importaba con una sola
-- institución: `find_candidate_offers` ahora solo empareja usuarios de la
-- MISMA institución. Sin esto, dos empresas cliente distintas se
-- emparejarían entre sí, lo cual no tiene sentido para el producto.

-- ─── 1. Tabla de instituciones ────────────────────────────────────────────

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email_domain text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.institutions is
  'Instituciones/empresas cliente. Cada una tiene su propio dominio de correo institucional; los viajes solo se emparejan entre miembros de la misma institución.';

insert into public.institutions (name, email_domain) values ('ITAM', 'itam.mx');

alter table public.institutions enable row level security;

-- Lectura pública: se necesita poder mostrar/validar la institución desde
-- /registro antes de que exista una sesión autenticada. No hay datos
-- sensibles en esta tabla (solo nombre y dominio de correo).
create policy "anyone can read institutions" on public.institutions
  for select using (true);

-- ─── 2. profiles.institution_id ───────────────────────────────────────────

alter table public.profiles
  add column institution_id uuid references public.institutions (id);

update public.profiles
set institution_id = (select id from public.institutions where email_domain = 'itam.mx')
where institution_id is null;

alter table public.profiles
  alter column institution_id set not null;

create index profiles_institution_idx on public.profiles (institution_id);

-- ─── 3. handle_new_user: ahora también resuelve institution_id por dominio ──

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_domain text;
  matched_institution_id uuid;
begin
  user_domain := lower(split_part(new.email, '@', 2));

  select id into matched_institution_id
  from public.institutions
  where email_domain = user_domain;

  insert into public.profiles (id, full_name, phone, institution_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    matched_institution_id
  );
  return new;
end;
$$;

-- ─── 4. restrict_signup_to_itam_domain: valida contra la tabla institutions ─
-- Se mantiene el mismo NOMBRE de función para no tener que reconectar el
-- hook "Before User Created" en el panel de Supabase — solo cambia el
-- cuerpo. Se vuelve `security definer` (antes no lo era) porque ahora
-- necesita leer `institutions`, y el rol que ejecuta el hook
-- (supabase_auth_admin) no tiene permisos de tabla por su cuenta.

create or replace function public.restrict_signup_to_itam_domain(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  domain text;
  existe boolean;
begin
  user_email := event -> 'user' ->> 'email';
  domain := lower(split_part(coalesce(user_email, ''), '@', 2));

  select exists(
    select 1 from public.institutions where email_domain = domain
  ) into existe;

  if not existe then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Tu institución todavía no está registrada en Carpool. Contáctanos para agregarla.',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.restrict_signup_to_itam_domain to supabase_auth_admin;
revoke execute on function public.restrict_signup_to_itam_domain from authenticated, anon, public;

-- ─── 5. find_candidate_offers: ahora solo empareja dentro de la misma institución ──

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
  join public.profiles p1 on p1.id = o1.user_id
  join public.trip_offers o2
    on o2.direction = o1.direction
   and o2.role <> o1.role
   and o2.status = 'buscando'
   and o2.id <> o1.id
   and abs(extract(epoch from (o2.scheduled_time - o1.scheduled_time))) <= (p_time_window_minutes * 60)
   and ST_DWithin(o1.home_location, o2.home_location, p_radius_km * 1000)
  join public.profiles p2
    on p2.id = o2.user_id
   and p2.institution_id = p1.institution_id
  where o1.id = p_offer_id
  order by o1.home_location <-> o2.home_location
  limit p_limit;
$$;
