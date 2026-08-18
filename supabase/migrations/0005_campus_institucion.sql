-- 0005_campus_institucion.sql
-- Agrega la coordenada del campus/oficina principal de cada institución.
-- No se usa para el emparejamiento real (find_candidate_offers compara
-- directamente las coordenadas de las dos personas, ver 0004_instituciones.sql)
-- — es solo para poder mostrar un ESTIMADO de precio/ganancia en /reserva
-- antes de que exista un match real, calculando la distancia en línea recta
-- de la dirección que el usuario escribe hasta el campus (ver
-- lib/actions/reserva.ts::previsualizarDireccion). Por eso son columnas
-- planas (double precision), no un tipo geography/PostGIS: no se necesita
-- ningún índice espacial ni consulta ST_* sobre esta columna, un cálculo de
-- Haversine en TypeScript es suficiente y más simple.
--
-- Coordenadas del campus Río Hondo del ITAM verificadas por búsqueda web
-- (Google Maps: "ITAM - Instituto Tecnológico Autónomo de México", Río
-- Hondo 1, Altavista, Álvaro Obregón, 01080 CDMX) — no se pudo verificar
-- desde este entorno de trabajo con una llamada directa a un servicio de
-- geocoding (mismo bloqueo de red de siempre para dominios fuera de la
-- lista blanca del sandbox).

alter table public.institutions add column campus_lat double precision;
alter table public.institutions add column campus_lng double precision;

comment on column public.institutions.campus_lat is
  'Latitud del campus/oficina principal — opcional. Si es null, /reserva simplemente no muestra el estimado de precio para esa institución.';
comment on column public.institutions.campus_lng is
  'Ver campus_lat.';

update public.institutions
set campus_lat = 19.3443468,
    campus_lng = -99.199729
where email_domain = 'itam.mx';
