-- 0003_matching_helpers.sql
-- Ayuda para Fase 3 (Consultar viajes / emparejamiento).
--
-- PostgREST no expone de forma legible las columnas `geography` en las
-- respuestas JSON (llegan como WKB hexadecimal — ver la guía de PostGIS de
-- Supabase), así que en vez de intentar decodificarlas en el cliente, esta
-- función calcula la distancia directamente en la base de datos y regresa
-- un número plano (metros).
--
-- Restringida a service_role, igual que find_candidate_offers() en
-- 0002_functions.sql y por la misma razón: solo el servidor (con la llave
-- de servicio, nunca el navegador con la llave anónima) debe poder comparar
-- la ubicación exacta de dos ofertas de dos usuarios distintos.

create or replace function public.distance_between_offers(
  p_offer_id_1 uuid,
  p_offer_id_2 uuid
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select ST_Distance(o1.home_location, o2.home_location)
  from public.trip_offers o1, public.trip_offers o2
  where o1.id = p_offer_id_1 and o2.id = p_offer_id_2;
$$;

revoke execute on function public.distance_between_offers from authenticated, anon, public;
grant execute on function public.distance_between_offers to service_role;
