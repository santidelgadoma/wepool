-- 0009_feed_tiempo_real.sql
-- Feed en tiempo real: el usuario pidió "escuchar" los viajes nuevos con
-- WebSockets mientras el pasajero todavía no tiene una solicitud elegida —
-- hoy tiene que recargar el home a mano para ver una oferta que un
-- conductor acaba de publicar. Se implementa con **Realtime Broadcast desde
-- la base de datos** (`realtime.send`, la forma que Supabase recomienda
-- desde 2024 para este caso — no "Postgres Changes", que transmite los
-- cambios de fila crudos y por RLS no dejaría ver ofertas de OTROS usuarios
-- de todas formas, exactamente la misma razón por la que find_driver_offers_near
-- y find_candidate_offers ya corren con service_role en vez de leerse
-- directo desde el navegador — ver 0002_functions.sql).
--
-- Diseño: un trigger en trip_offers manda un mensaje corto (solo la
-- `direction`, nada de direcciones/nombres) a un canal por institución
-- (`feed-<institution_id>`) cada vez que una oferta de conductor se vuelve
-- 'buscando' (recién publicada, o disponible de nuevo tras un rechazo/
-- cancelación — ver 0008_solicitudes_urgentes.sql). El navegador solo
-- recibe la SEÑAL de "algo cambió" y vuelve a pedir el feed real por el
-- camino de siempre (obtenerFeed, con service_role) — el canal nunca carga
-- datos sensibles, así que aunque alguien lo escuchara sin autorización no
-- vería nada que no fuera ya público (el UUID de su propia institución).
--
-- Aun así se deja como canal PRIVADO (no público) y con una política de
-- autorización que solo deja escuchar a alguien autenticado de la MISMA
-- institución -- no porque el payload sea sensible, sino para no romper el
-- patrón de "todo pasa por RLS o por una función restringida a
-- service_role" que se sigue en el resto del proyecto.

-- ─── 1. Política de autorización del canal (realtime.messages) ─────────────
-- RLS ya está habilitada por default en realtime.messages (no hace falta
-- alter table). realtime.topic() regresa el canal al que se está
-- suscribiendo el cliente -- se compara contra 'feed-' + la institución del
-- usuario autenticado.

drop policy if exists "feed broadcasts escuchables solo por la propia institucion" on realtime.messages;

create policy "feed broadcasts escuchables solo por la propia institucion"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'feed-' || (
    select p.institution_id::text
    from public.profiles p
    where p.id = auth.uid()
  )
);

-- ─── 2. Trigger: avisa cuando una oferta de conductor se vuelve 'buscando' ──
-- Cubre tanto el INSERT normal (crearOferta en /reserva) como el UPDATE que
-- ya existía para "disponible de nuevo" (responderSolicitud al rechazar,
-- cancelarOferta -- ver lib/actions/solicitudes.ts y lib/actions/cancelar.ts).
-- security definer + search_path vacío (con todo completamente calificado)
-- es el patrón que la documentación actual de Supabase recomienda para
-- funciones que llaman a realtime.send -- evita que alguien pueda secuestrar
-- la función manipulando el search_path.

create or replace function public.notificar_oferta_disponible()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_institution_id uuid;
begin
  select p.institution_id into v_institution_id
  from public.profiles p
  where p.id = new.user_id;

  if v_institution_id is not null then
    perform realtime.send(
      jsonb_build_object('direction', new.direction),
      'nueva_oferta',
      'feed-' || v_institution_id::text,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trip_offers_notificar_oferta_disponible on public.trip_offers;

create trigger trip_offers_notificar_oferta_disponible
after insert or update of status on public.trip_offers
for each row
when (new.role = 'conductor' and new.status = 'buscando')
execute function public.notificar_oferta_disponible();
