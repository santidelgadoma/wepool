# Progreso — Carpool ITAM MVP

Meta: llegar a una **demo funcional para inversionistas**. Este archivo se actualiza conforme avanza el desarrollo.

Última actualización: 17 de agosto de 2026

## Fase 0 — Fundaciones (arquitectura)

- [x] Revisión de la tesina y tecnologías usadas en el prototipo académico
- [x] Definición de arquitectura del MVP: Next.js + TypeScript + Supabase (Postgres + PostGIS + Auth)
- [x] Diseño detallado del esquema de base de datos (tablas + políticas RLS) — ver `docs/esquema_base_datos.md` y `supabase/migrations/`
- [ ] Wireframes de las pantallas clave

## Fase 1 — Infraestructura base

- [x] Proyecto Next.js 15 + TypeScript + Tailwind creado (código en la carpeta del proyecto)
- [x] `git init` + primer commit — repo en `github.com/santidelgadoma/wepool`
- [x] Proyecto de Supabase creado (dev)
- [x] Proyecto de Vercel conectado al repo (`wepool-op34`, deploy de producción exitoso)
- [x] Migraciones `0001_init_schema.sql` y `0002_functions.sql` aplicadas en el proyecto real
- [x] Auth Hook de dominio institucional conectado desde el panel de Supabase (Authentication → Hooks)
- [x] Extensión PostGIS habilitada (parte de la migración ya aplicada)
- [x] `npm install` + `npm run build` corridos (localmente por el usuario, y en Vercel) — ver nota del fix de TypeScript abajo

## Fase 2 — Autenticación

- [x] Registro con correo institucional (@itam.mx) — código escrito en `app/(auth)/registro`
- [x] Verificación de correo — **cambiada a link mágico** (ver nota abajo); `app/auth/callback/route.ts` intercambia el código por sesión. Falta agregar `http://localhost:3000/auth/callback` a Redirect URLs en el panel de Supabase.
- [x] Login / sesión — `app/(auth)/login` + middleware de protección de rutas
- [x] Políticas de Row Level Security por tabla — ya en `0001_init_schema.sql`, aplicadas

## Fase 3 — Funcionalidad core

- [x] Publicar viaje como conductor (ida) — pantalla `/reserva`, un solo formulario cubre conductor/pasajero × ida/regreso (ver nota abajo)
- [x] Publicar viaje como conductor (regreso)
- [x] Reservar viaje como pasajero (ida)
- [x] Reservar viaje como pasajero (regreso)
- [x] Algoritmo de emparejamiento con PostGIS (+ estimación temporal de duración; Google Distance Matrix queda para Fase 4) — pantalla `/consultar`, ver nota abajo
- [x] Confirmación de viaje (conductor elige pasajero / pasajero elige viaje) — `lib/actions/consultar.ts` → `elegirCandidato`
- [x] Cancelación de reservación — pantalla `/cancelar`
- [x] Historial de viajes — pantalla `/historial`
- [x] Vista "viajes de mañana" — pantalla `/manana`

## Fase 4 — Integraciones externas

- [~] Geocoding — implementado con **OpenStreetMap Nominatim** (gratuito, sin API key) como solución temporal, ver nota abajo. Falta reemplazar por Google Geocoding cuando se conecte `GOOGLE_MAPS_API_KEY`.
- [ ] Distance Matrix (Google) — para el paso 2 del emparejamiento (confirmar desvío real del conductor), ver `docs/esquema_base_datos.md` sección 3
- [ ] Creación de evento en Google Calendar al confirmar viaje
- [ ] Correos de recordatorio (Resend)
- [ ] Limpieza automática de reservaciones vencidas (pg_cron) — la función y el `cron.schedule` ya están en `0002_functions.sql`; falta solo verificar que corrió en el proyecto real

## Fase 5 — Pulido para demo

- [ ] Diseño visual con shadcn/ui aplicado a las 8 pantallas
- [ ] Datos de ejemplo (seed) realistas para la demo
- [ ] Prueba de flujo completo extremo a extremo
- [x] Dominio público desplegado (Vercel)
- [ ] Guion / narrativa de la demo para inversionistas

## Notas y decisiones

- 2026-08-14: Se decidió arquitectura "todo en TypeScript" (Next.js + Supabase) en vez de mantener un backend Python separado, priorizando velocidad de desarrollo hacia la demo. Ver `docs/arquitectura_mvp.md`.
- 2026-08-14: Se diseñó el esquema de base de datos consolidando las 4 tablas de reservación de la tesina en una sola (`trip_offers`), con emparejamiento geoespacial vía PostGIS (`find_candidate_offers`) y restricción de registro a correo institucional vía Supabase Auth Hook. Ver `docs/esquema_base_datos.md`.
- 2026-08-14 (noche): Proyecto de Supabase real creado, ambas migraciones aplicadas y Auth Hook de dominio institucional conectado.
- 2026-08-14 (noche): Se armó el proyecto Next.js (App Router, TypeScript, Tailwind, componentes estilo shadcn/ui escritos a mano, clientes de Supabase para browser/server/middleware, las 8 pantallas de la tesina enrutadas). Registro, verificación, login/logout y `/home` implementados de verdad; reserva/cancelar/consultar/historial/mañana eran placeholders para Fase 3 (ya no).
- 2026-08-14 (noche): Se cambió el registro a **link mágico** en vez de código de 6 dígitos, por la restricción de Supabase (desde el 3 de junio de 2026) de personalizar plantillas de correo en plan gratuito sin SMTP propio. Documentado en `docs/arquitectura_mvp.md` y `docs/esquema_base_datos.md`.
- 2026-08-17: `git init` + primer commit hechos por el usuario (repo `santidelgadoma/wepool` en GitHub). Al conectar Vercel, el primer deploy falló con `Type error: Parameter 'cookiesToSet' implicitly has an 'any' type` en `lib/supabase/middleware.ts` y `server.ts` — el patrón de `@supabase/ssr` para `setAll(cookiesToSet)` pierde el tipado contextual cuando el objeto de cookies se resuelve contra un tipo unión (`CookieMethodsServer`), así que TypeScript en modo estricto lo marca como `any` implícito. Se corrigió anotando explícitamente `cookiesToSet: { name: string; value: string; options?: CookieOptions }[]` (con `CookieOptions` importado de `@supabase/ssr`, confirmado que existe revisando el código fuente del paquete). Deploy de producción exitoso después del fix: `wepool-op34-*.vercel.app`.
- 2026-08-17: Se implementó Fase 3 (publicar/reservar viaje, cancelar, historial, mañana) contra el esquema real (`trip_offers`, `confirmed_trips`) usando Server Actions de Next.js + RLS (sin necesitar la llave de servicio de Supabase). Decisiones:
  - **Geocoding temporal con OpenStreetMap Nominatim** (`lib/geocoding.ts`) en vez de esperar a `GOOGLE_MAPS_API_KEY` — decisión del usuario para no bloquear Fase 3. Toda la app pasa por esta única función, así que cambiar a Google Geocoding en Fase 4 es reescribir un archivo, no tocar el resto del código.
  - Un solo formulario en `/reserva` (`components/reserva-form.tsx`) cubre los 4 casos de PROGRESS.md (conductor/pasajero × ida/regreso), tal como ya sugería el placeholder original y el diseño de `trip_offers` (una tabla con columnas `direction`/`role` en vez de 4 tablas).
  - `lib/datetime.ts` centraliza la regla "solo para mañana" y las conversiones de zona horaria, asumiendo offset fijo UTC-6 para America/Mexico_City (México ya no observa horario de verano desde 2022).
  - **Pendiente y bloqueado:** "Consultar viajes disponibles" (`/consultar`, ejecuta `find_candidate_offers`) y la confirmación de viaje requieren `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role en el panel de Supabase) porque esa función está restringida a `service_role` a propósito (ver `docs/esquema_base_datos.md` sección 3, nota de seguridad). No se ha pedido/agregado esa llave todavía — es el siguiente pendiente real de Fase 3.
- 2026-08-17: El usuario compartió la `SUPABASE_SERVICE_ROLE_KEY` y se completó Fase 3: `/consultar` (emparejamiento) y la confirmación de viaje. Decisiones/hallazgos:
  - PostgREST no serializa columnas `geography` como JSON legible en respuestas normales (llegan como WKB hexadecimal — confirmado revisando la guía oficial de PostGIS de Supabase), así que en vez de decodificar eso en JS se agregó `supabase/migrations/0003_matching_helpers.sql` con una función `distance_between_offers(uuid, uuid)` que calcula la distancia en metros directamente en Postgres (restringida a `service_role`, mismo patrón que `find_candidate_offers`). **Esta migración todavía no se ha aplicado al proyecto real** — pendiente que el usuario la corra (SQL Editor del panel de Supabase, o `supabase db push`).
  - `lib/supabase/admin.ts`: cliente con la llave de servicio, usado SOLO desde Server Actions (`lib/actions/consultar.ts`), nunca desde componentes de cliente. Cada función que lo usa valida a mano (contra `supabase.auth.getUser()` del cliente normal, no el admin) que el usuario autenticado es dueño de la oferta antes de dejarlo actuar — la llave de servicio salta RLS, así que esa validación manual es la única barrera.
  - La duración mostrada en `/consultar` es una estimación (distancia en línea recta ÷ velocidad promedio de 22 km/h) hasta que se conecte Google Distance Matrix en Fase 4 — está señalado en la UI, no se presenta como dato real.
  - `SUPABASE_SERVICE_ROLE_KEY` se agregó a `.env.local` y a las variables de entorno de Vercel (Production). **Nunca** lleva prefijo `NEXT_PUBLIC_`.
