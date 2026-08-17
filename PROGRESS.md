# Progreso — Carpool ITAM MVP

Meta: llegar a una **demo funcional para inversionistas**. Este archivo se actualiza conforme avanza el desarrollo.

Última actualización: 14 de agosto de 2026 (noche)

## Fase 0 — Fundaciones (arquitectura)

- [x] Revisión de la tesina y tecnologías usadas en el prototipo académico
- [x] Definición de arquitectura del MVP: Next.js + TypeScript + Supabase (Postgres + PostGIS + Auth)
- [x] Diseño detallado del esquema de base de datos (tablas + políticas RLS) — ver `docs/esquema_base_datos.md` y `supabase/migrations/`
- [ ] Wireframes de las pantallas clave

## Fase 1 — Infraestructura base

- [x] Proyecto Next.js 15 + TypeScript + Tailwind creado (código en la carpeta del proyecto)
- [ ] `git init` + primer commit (pendiente — hazlo tú localmente, no tengo acceso a shell en tu máquina)
- [x] Proyecto de Supabase creado (dev)
- [ ] Proyecto de Vercel conectado al repo
- [x] Migraciones `0001_init_schema.sql` y `0002_functions.sql` aplicadas en el proyecto real
- [x] Auth Hook de dominio institucional conectado desde el panel de Supabase (Authentication → Hooks)
- [x] Extensión PostGIS habilitada (parte de la migración ya aplicada)
- [ ] `npm install` + `npm run build` corridos localmente para verificar el scaffold (no lo pude probar yo: el sandbox no tuvo acceso a los registros de paquetes en esta sesión)

## Fase 2 — Autenticación

- [x] Registro con correo institucional (@itam.mx) — código escrito en `app/(auth)/registro`
- [x] Verificación de correo — **cambiada a link mágico** (ver nota abajo); `app/auth/callback/route.ts` intercambia el código por sesión. Falta agregar `http://localhost:3000/auth/callback` a Redirect URLs en el panel de Supabase.
- [x] Login / sesión — `app/(auth)/login` + middleware de protección de rutas
- [x] Políticas de Row Level Security por tabla — ya en `0001_init_schema.sql`, aplicadas

## Fase 3 — Funcionalidad core

- [ ] Publicar viaje como conductor (ida)
- [ ] Publicar viaje como conductor (regreso)
- [ ] Reservar viaje como pasajero (ida)
- [ ] Reservar viaje como pasajero (regreso)
- [ ] Algoritmo de emparejamiento con PostGIS + Google Distance Matrix
- [ ] Confirmación de viaje (conductor elige pasajero / pasajero elige viaje)
- [ ] Cancelación de reservación
- [ ] Historial de viajes
- [ ] Vista "viajes de mañana"

## Fase 4 — Integraciones externas

- [ ] Geocoding y distance matrix (Google Maps)
- [ ] Creación de evento en Google Calendar al confirmar viaje
- [ ] Correos de recordatorio (Resend)
- [ ] Limpieza automática de reservaciones vencidas (pg_cron)

## Fase 5 — Pulido para demo

- [ ] Diseño visual con shadcn/ui aplicado a las 8 pantallas
- [ ] Datos de ejemplo (seed) realistas para la demo
- [ ] Prueba de flujo completo extremo a extremo
- [ ] Dominio público desplegado
- [ ] Guion / narrativa de la demo para inversionistas

## Notas y decisiones

- 2026-08-14: Se decidió arquitectura "todo en TypeScript" (Next.js + Supabase) en vez de mantener un backend Python separado, priorizando velocidad de desarrollo hacia la demo. Ver `docs/arquitectura_mvp.md`.
- 2026-08-14: Se diseñó el esquema de base de datos consolidando las 4 tablas de reservación de la tesina en una sola (`trip_offers`), con emparejamiento geoespacial vía PostGIS (`find_candidate_offers`) y restricción de registro a correo institucional vía Supabase Auth Hook. Migraciones probadas localmente contra Postgres (constraints de rol/vehículo, trigger de creación de perfil, función de emparejamiento y hook de dominio, todos verificados). Ver `docs/esquema_base_datos.md`.
- 2026-08-14 (noche): Proyecto de Supabase real creado, ambas migraciones aplicadas y Auth Hook de dominio institucional conectado — la base de datos del MVP ya existe y está viva. Pendiente: repo de código y proyecto de Vercel.
- 2026-08-14 (noche): Se armó el proyecto Next.js (App Router, TypeScript, Tailwind, componentes estilo shadcn/ui escritos a mano, clientes de Supabase para browser/server/middleware, las 8 pantallas de la tesina enrutadas). Registro, verificación, login/logout y la pantalla `/home` quedaron implementados de verdad (no placeholders); reserva/cancelar/consultar/historial/mañana son placeholders para la Fase 3. **Importante:** el sandbox no tuvo acceso a npm/PyPI/apt en esta sesión, así que no pude correr `npm install` ni `npm run build` para verificarlo — hice una revisión manual cuidadosa (rutas de imports, balance de llaves, JSON válido) pero el primer `npm install` real lo corre el usuario.
- 2026-08-14 (noche): El usuario corrió `npm install`/`npm run dev` sin problemas de compilación (el único error fue un `NEXT_PUBLIC_SUPABASE_URL` mal copiado — ya resuelto). Scaffold verificado en la práctica.
- 2026-08-14 (noche): Al probar el registro nos topamos con que Supabase, desde el 3 de junio de 2026, no deja personalizar plantillas de correo (necesario para el código de 6 dígitos tipo tesina) en proyectos nuevos del plan gratuito sin SMTP propio. El usuario eligió **cambiar el registro a link mágico** en vez de conectar SMTP propio o pagar plan Pro, para no bloquear el avance. Se agregó `app/auth/callback/route.ts` (intercambia el código del link por sesión) y se simplificó `/registro` a un solo paso. Pendiente: agregar `http://localhost:3000/auth/callback` a Redirect URLs en el panel de Supabase. Documentado en `docs/arquitectura_mvp.md` y `docs/esquema_base_datos.md`.
