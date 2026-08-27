-- 0010_chat.sql
-- Chat conductor/pasajero por viaje confirmado (ver PROGRESS.md, pendiente de
-- backlog agregado 2026-08-24, diseñado en detalle en
-- docs/diseno_chat_y_calificaciones.md sección A antes de escribir nada de
-- esto). Cuelga de confirmed_trips, no de trip_offers/trip_matches -- solo
-- tiene sentido chatear una vez que el viaje ya está confirmado entre dos
-- personas específicas, y a diferencia de trip_offers (donde hay que ocultar
-- datos de gente con la que todavía no hay match, de ahí las funciones
-- service_role de 0002_functions.sql), confirmed_trips ya identifica
-- exactamente a los dos únicos usuarios involucrados (driver_id,
-- passenger_id) -- así que esto se protege con RLS normal, sin ninguna
-- función service_role.

-- ─── 1. Tabla ────────────────────────────────────────────────────────────────
-- sender_id no se restringe aquí con un check a "driver_id o passenger_id de
-- ese confirmed_trip" porque un check no puede consultar otra tabla -- esa
-- validación vive en la política RLS de insert (abajo) y, del lado del
-- servidor, en el Server Action como defensa en profundidad (mismo patrón que
-- ya usa responderSolicitud en lib/actions/solicitudes.ts).

create table public.trip_messages (
  id uuid primary key default gen_random_uuid(),
  confirmed_trip_id uuid not null references public.confirmed_trips (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index trip_messages_trip_idx on public.trip_messages (confirmed_trip_id, created_at);

comment on table public.trip_messages is
  'Mensajes de chat entre conductor y pasajero de un viaje ya confirmado. Sin edición ni borrado -- una vez mandado, se queda.';

-- ─── 2. Row Level Security ───────────────────────────────────────────────────
-- Nadie puede editar ni borrar mensajes (no hay política de update/delete) --
-- igual que un chat real. Si más adelante se quiere "borrar para mí" o
-- edición, es una feature aparte.

alter table public.trip_messages enable row level security;

create policy "involved users read messages" on public.trip_messages
  for select using (
    exists (
      select 1 from public.confirmed_trips ct
      where ct.id = confirmed_trip_id
        and (ct.driver_id = auth.uid() or ct.passenger_id = auth.uid())
    )
  );

create policy "involved users send messages" on public.trip_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.confirmed_trips ct
      where ct.id = confirmed_trip_id
        and (ct.driver_id = auth.uid() or ct.passenger_id = auth.uid())
    )
  );

-- ─── 3. Entrega en tiempo real ───────────────────────────────────────────────
-- Mismo patrón que el feed del home (0009_feed_tiempo_real.sql: Realtime
-- Broadcast desde la base de datos, no "Postgres Changes"), pero aquí con una
-- diferencia importante: como el canal se autoriza exactamente a los dos
-- usuarios del viaje (no a "toda la institución" como el feed), sí es seguro
-- incluir el contenido real del mensaje en el broadcast -- no hace falta el
-- truco de "solo mandar una señal y volver a pedir los datos por un camino
-- con service_role" que usa el feed. Canal privado por viaje confirmado:
-- chat-<confirmed_trip_id>.

drop policy if exists "chat escuchable solo por conductor y pasajero del viaje" on realtime.messages;

create policy "chat escuchable solo por conductor y pasajero del viaje"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.confirmed_trips ct
    where 'chat-' || ct.id::text = realtime.topic()
      and (ct.driver_id = auth.uid() or ct.passenger_id = auth.uid())
  )
);

create or replace function public.notificar_mensaje_nuevo()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'sender_id', new.sender_id,
      'body', new.body,
      'created_at', new.created_at
    ),
    'nuevo_mensaje',
    'chat-' || new.confirmed_trip_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists trip_messages_notificar_mensaje_nuevo on public.trip_messages;

create trigger trip_messages_notificar_mensaje_nuevo
after insert on public.trip_messages
for each row
execute function public.notificar_mensaje_nuevo();
