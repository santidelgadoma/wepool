# Esquema de base de datos — Carpool ITAM

**Estado:** diseño listo para aplicar (migraciones en `supabase/migrations/`)
**Fecha:** 14 de agosto de 2026
**Depende de:** [`arquitectura_mvp.md`](./arquitectura_mvp.md) — PostgreSQL (Supabase) + PostGIS.

Este documento detalla el esquema que reemplaza las tablas de la tesina (`Usuarios`, `Viajes_Ida_Pasajero`, `Viajes_Ida_Conductor`, `Viajes_Regreso_Conductor`, `Viajes_Regreso_Pasajero`, `Viajes_Asignados_Ida`, `Viajes_Asignados_Regreso`, `Viajes`) y explica el porqué de cada cambio. El SQL ejecutable está en:

- `supabase/migrations/0001_init_schema.sql` — extensiones, tipos, tablas, índices, Row Level Security.
- `supabase/migrations/0002_functions.sql` — automatizaciones: creación de perfil, restricción de dominio institucional, emparejamiento geoespacial, limpieza de reservas vencidas.

---

## 1. Diagrama entidad-relación

```mermaid
erDiagram
    auth_users ||--|| profiles : "extiende"
    profiles ||--o{ vehicles : "posee"
    profiles ||--o{ trip_offers : "publica"
    vehicles ||--o{ trip_offers : "usado en"
    trip_offers ||--o{ trip_matches : "como conductor"
    trip_offers ||--o{ trip_matches : "como pasajero"
    trip_matches ||--o| confirmed_trips : "se confirma en"
    profiles ||--o{ confirmed_trips : "conductor/pasajero"
    vehicles ||--o{ confirmed_trips : "usado en"

    profiles {
        uuid id PK
        text full_name
        text phone
    }
    vehicles {
        uuid id PK
        uuid owner_id FK
        text plate
        text description
    }
    trip_offers {
        uuid id PK
        uuid user_id FK
        enum direction
        enum role
        uuid vehicle_id FK
        text home_address
        geography home_location
        timestamptz scheduled_time
        bool uses_toll_roads
        text meeting_point
        enum status
    }
    trip_matches {
        uuid id PK
        uuid driver_offer_id FK
        uuid passenger_offer_id FK
        int estimated_duration_minutes
        bool passenger_confirmed
    }
    confirmed_trips {
        uuid id PK
        uuid match_id FK
        uuid driver_id FK
        uuid passenger_id FK
        text calendar_event_id
        enum status
    }
```

---

## 2. Por qué una sola tabla `trip_offers` en vez de cuatro

La tesina tenía `Viajes_Ida_Pasajero`, `Viajes_Ida_Conductor`, `Viajes_Regreso_Conductor` y `Viajes_Regreso_Pasajero` como tablas separadas, con la misma forma pero duplicada cuatro veces. Eso obliga a duplicar cada consulta y cada regla de validación cuatro veces.

`trip_offers` consolida las cuatro con dos columnas: `direction` (`ida`/`regreso`) y `role` (`conductor`/`pasajero`). El extremo fijo del viaje siempre es el campus; `home_address`/`home_location` describen el extremo variable:

- `direction = 'ida'` → `home_location` es el origen (de dónde sale el usuario); el destino es el ITAM.
- `direction = 'regreso'` → `home_location` es el destino (a dónde llega el usuario); el origen es el ITAM.

Reglas específicas de la tesina se mantienen como *constraints* de base de datos en vez de validaciones repetidas en cada endpoint:

- Solo un conductor puede traer `vehicle_id` (`driver_requires_vehicle` / `passenger_has_no_vehicle`).
- Solo un conductor declara preferencia de vías de cuota (`driver_states_toll_preference`).
- Solo el conductor de un viaje de regreso debe indicar `meeting_point` dentro del campus (`driver_regreso_requires_meeting_point`).

Esto significa que un dato inconsistente (por ejemplo, un pasajero con vehículo asignado) no puede ni siquiera insertarse, sin importar qué parte del código lo intente — la tesina dependía de que cada endpoint de Flask validara esto a mano.

---

## 3. Emparejamiento geográfico (`find_candidate_offers`)

La tesina calculaba compatibilidad llamando a la API de Distance Matrix de Google **para cada par** conductor–pasajero disponible. Funciona, pero cada llamada cuesta cuota y tiempo, y crece de forma cuadrática con el número de usuarios.

El nuevo flujo tiene dos pasos:

1. **Pre-filtro en la base de datos** (`find_candidate_offers`, en `0002_functions.sql`): usa el índice espacial GiST de PostGIS para encontrar, en milisegundos, los candidatos más cercanos que además coincidan en dirección, rol opuesto, estatus `buscando` y una ventana de horario razonable (±30 min por default). Esto reduce cientos de comparaciones posibles a un puñado de candidatos reales.
2. **Confirmación con Google Distance Matrix** (desde el servidor, en Next.js): solo para esos pocos candidatos ya pre-filtrados, se llama a Google para calcular el desvío real del conductor y aplicar la regla de negocio de la tesina ("si el viaje con el pasajero no supera el tiempo normal del conductor + 15 minutos, se considera candidato").

**Nota de seguridad:** `find_candidate_offers` es `SECURITY DEFINER` y su ejecución está restringida al rol `service_role` (revocada para `authenticated`/`anon`). Esto es intencional: la función necesita leer `home_location` de otros usuarios para calcular cercanía, pero esa información no debe ser accesible directo desde el navegador de un usuario cualquiera — solo el servidor (Server Action de Next.js con la llave de servicio) puede invocarla, y solo debe devolver al cliente los datos ya filtrados (hora estimada y duración), nunca la dirección exacta de alguien con quien todavía no hay un viaje confirmado. Los datos de contacto y dirección completos solo se exponen vía las políticas de `profiles`/`vehicles` una vez que existe una fila en `confirmed_trips` (sección 5).

---

## 4. Autenticación y verificación institucional

- El registro, la verificación de correo y el guardado seguro de la contraseña ya no se programan a mano: los resuelve **Supabase Auth**.
- **Actualización 2026-08-14:** el plan original era verificación por código de 6 dígitos (OTP por correo). Desde el 3 de junio de 2026, Supabase restringió la personalización de plantillas de correo (necesaria para mandar un código en vez de un link) a proyectos con SMTP propio o plan de pago. Mientras el proyecto siga en el plan gratuito con el correo por default de Supabase, el registro confirma por **link mágico** en vez de código — ver `app/auth/callback/route.ts` en el proyecto Next.js. La restricción de dominio institucional (siguiente punto) y la creación automática de perfil funcionan igual en ambos flujos, no cambia nada del esquema.
- La restricción "solo miembros del ITAM" se implementa con un *Auth Hook* de Supabase (`restrict_signup_to_itam_domain`, en `0002_functions.sql`) que rechaza cualquier registro cuyo correo no termine en `@itam.mx`, antes de que la cuenta se cree. Se conecta desde el panel de Supabase en *Authentication → Hooks → Before User Created*. ([Documentación oficial](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook))
- Cuando Supabase Auth confirma el registro, el trigger `on_auth_user_created` crea automáticamente la fila correspondiente en `profiles` — equivalente al paso de la tesina de "crear un registro en la tabla de usuarios", pero sin código de aplicación de por medio.

---

## 5. De candidato a viaje confirmado

Refleja el flujo de la tesina (mostrar candidatos → elegir uno → borrar las demás reservas):

1. Se calculan candidatos con `find_candidate_offers` + Distance Matrix y se guardan en `trip_matches`.
2. El pasajero elige uno de sus candidatos → `trip_matches.passenger_confirmed = true`.
3. El conductor ve los candidatos donde ya hay un pasajero confirmado y elige uno → la aplicación crea la fila en `confirmed_trips` (con el evento de Google Calendar ya creado) y **borra** el resto de `trip_offers`/`trip_matches` relacionados con ambos usuarios para ese viaje — mismo comportamiento que la tesina ("El sistema deberá borrar todos los registros de las reservas de cada usuario"), ahora con `on delete cascade` ayudando a limpiar automáticamente los `trip_matches` huérfanos.
4. `confirmed_trips` sirve tanto para mostrar "los viajes de mañana" como para el historial — reemplaza la tabla `Viajes` de la tesina.

---

## 6. Limpieza de reservas vencidas

La tesina usaba un hilo de Python que vivía dentro del proceso del servidor Flask — si el servidor se reiniciaba, el hilo (y su temporizador) se perdía. `expire_stale_offers()` corre como tarea programada de **pg_cron** cada 15 minutos directamente en la base de datos (ver `0002_functions.sql`), así que no depende de que ningún servidor esté corriendo.

---

## 7. Regla "solo para el día siguiente"

La tesina restringe: *"Los viajes reservados deberán ser exclusivamente para el día siguiente."* Se deja como validación de aplicación (en el formulario y en el Server Action de Next.js, comparando `scheduled_time` contra "mañana" en la zona horaria de Ciudad de México) en vez de un `CHECK` de base de datos, porque "mañana" cambia cada día y un `CHECK` no puede depender de `now()` de forma confiable en Postgres. Si más adelante se relaja esta regla (por ejemplo, para reservar con varios días de anticipación de cara a una demo o piloto más amplio), es un cambio de una sola validación, no de esquema.

---

## 8. Cómo aplicar esto

Con el proyecto de Supabase ya creado (pendiente en `PROGRESS.md`, fase 1):

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Esto aplica `0001_init_schema.sql` y `0002_functions.sql` en orden. El *Auth Hook* de dominio institucional se conecta aparte, desde el panel (no se activa solo con la migración) — ver sección 4.
