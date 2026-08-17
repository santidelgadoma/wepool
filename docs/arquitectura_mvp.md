# Arquitectura del MVP — Carpool ITAM

**Estado:** propuesta inicial para arrancar desarrollo
**Fecha:** 14 de agosto de 2026
**Contexto:** este documento parte de la tesina *"Diseño e implementación de un prototipo de una aplicación para impulsar la cultura de transporte compartido dentro de una universidad"* (ITAM, 2025) y actualiza las decisiones tecnológicas para construir un MVP demostrable a inversionistas. La tesina usó SQLite, Flask y React puro — funcionales para un prototipo académico, pero con limitaciones para un producto que debe verse y escalar como una startup real.

Arquitectura elegida: **todo en TypeScript, Next.js + Supabase**, sin un backend Python separado. Un solo lenguaje de punta a punta, menos piezas que mantener, y velocidad máxima para llegar a una demo funcional.

---

## 1. Resumen: qué cambia respecto a la tesina

| Capa | Tesina (2025) | MVP propuesto | Por qué |
|---|---|---|---|
| Base de datos | SQLite (archivo local) | PostgreSQL gestionado (Supabase) con extensión **PostGIS** | SQLite bloquea toda la base en cada escritura (un solo escritor a la vez); Postgres soporta múltiples usuarios concurrentes sin bloquearse entre sí, y PostGIS acelera el emparejamiento por cercanía geográfica en vez de calcular distancias una por una |
| Backend | Flask + hilos de Python para limpiar reservas | Next.js (API Routes / Server Actions) + Supabase Edge Functions + `pg_cron` para tareas programadas | Un solo lenguaje (TypeScript) en frontend y backend; las tareas programadas viven en la base de datos misma, más confiables que un hilo dentro del proceso del servidor |
| Autenticación | Código de 6 dígitos hecho a mano + contraseña con SHA-256 + token propio | **Supabase Auth** (verificación por correo institucional con OTP, sesiones JWT, Row Level Security) | SHA-256 no está diseñado para contraseñas (es rápido de fuerza bruta); Supabase ya resuelve el flujo de "código de 6 dígitos por correo" que la tesina construyó desde cero, y añade seguridad a nivel de fila en la base de datos |
| Frontend | React (Create React App) con `useState`/`useEffect` | **Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui** | Mejor rendimiento percibido (renderizado en servidor), tipado estático que evita errores comunes, y componentes de UI ya pulidos — importante para que la demo se vea profesional frente a inversionistas |
| Mapas / rutas | Google Maps API (geocode + distance matrix) | Se mantiene **Google Maps Platform**, llamado desde el servidor (Route Handlers de Next.js) para no exponer la llave | Sigue siendo la opción con mejor calidad de datos para direcciones en CDMX; el crédito gratuito mensual (~$200 USD) alcanza sobradamente para el volumen de un MVP |
| Calendario | Google Calendar API | Se mantiene | Sigue siendo el estándar y la comunidad ITAM ya usa Google Workspace institucional |
| Correo | SMTP manual | Supabase Auth para OTP + **Resend** para recordatorios/notificaciones | Evita configurar y mantener un servidor SMTP propio; mejor entregabilidad |
| Hosting | Servidor local (`localhost:5000` / `localhost:3000`) | **Vercel** (frontend + funciones) + **Supabase** (base de datos, auth, funciones programadas) | Ambos con niveles gratuitos generosos, despliegue automático desde git, dominio público con HTTPS — listo para compartir con inversionistas sin infraestructura propia |

---

## 2. Base de datos

**Motor:** PostgreSQL 16+ gestionado por Supabase, con la extensión **PostGIS** habilitada.

**Por qué no seguir con SQLite:** SQLite guarda todo en un solo archivo con un solo escritor a la vez a nivel de base de datos. Eso funciona para una tesina con un usuario de prueba, pero no para una demo donde varias personas reservan viajes al mismo tiempo. Postgres usa control de concurrencia multiversión (MVCC): lectores y escritores no se bloquean entre sí.

**Por qué PostGIS:** la tesina calculaba compatibilidad conductor–pasajero llamando a la API de Distance Matrix de Google para cada par de reservaciones — funciona, pero no escala bien y consume cuota de la API sin necesidad. PostGIS permite indexar las direcciones como puntos geográficos y hacer búsquedas de "vecino más cercano" (`ORDER BY ubicación <-> punto_destino`) directamente en la base de datos, hasta ~1000x más rápido que comparar uno por uno. La API de Google se sigue usando, pero solo para confirmar el pre-filtrado que ya hizo Postgres, reduciendo llamadas.

**Boceto conceptual de esquema** (a refinar en la siguiente fase de diseño detallado):

- `profiles` — extiende `auth.users` de Supabase: nombre, teléfono, correo institucional.
- `vehicles` — placas y descripción del vehículo, ligado al conductor.
- `trip_offers` — viajes publicados (ida/regreso, conductor/pasajero) con origen y destino como columnas `geography(Point)`, hora, preferencia de vías de cuota, estatus.
- `trip_matches` — candidatos de emparejamiento calculados (equivalente a `Viajes_Asignados_Ida/Regreso` de la tesina).
- `confirmed_trips` — viajes confirmados, historial (equivalente a la tabla `Viajes`).

Esto consolida las cuatro tablas separadas de reservación de la tesina (`Viajes_Ida_Pasajero`, `Viajes_Ida_Conductor`, `Viajes_Regreso_Conductor`, `Viajes_Regreso_Pasajero`) en una sola tabla `trip_offers` con columnas de dirección/rol, lo cual simplifica las consultas y evita duplicar lógica cuatro veces.

**Migraciones:** Supabase CLI (`supabase migration new ...`) versiona los cambios de esquema en el repositorio de código, en vez de modificar la base a mano — esto es clave para llevar un historial claro de decisiones de cara al roadmap del proyecto.

---

## 3. "Backend" (lógica de negocio)

Sin servidor Python separado. La lógica vive en tres lugares dentro del mismo proyecto Next.js/Supabase:

1. **Route Handlers / Server Actions de Next.js** — reciben las peticiones del frontend (crear reservación, cancelar, confirmar viaje), validan datos (con `zod`) y hablan con Supabase. Aquí también se llama a la API de Google Maps y Google Calendar, del lado del servidor, para no exponer llaves en el navegador.
2. **Funciones RPC de Postgres** (`plpgsql` o `sql`) — el cálculo de compatibilidad geográfica (consulta PostGIS) vive como función dentro de la base de datos y se invoca vía `supabase.rpc(...)`. Es más rápido porque no hay ida y vuelta de datos entre servidor y base de datos.
3. **Supabase Edge Functions + `pg_cron`** — reemplazan los hilos de Python de la tesina para tareas programadas: borrar reservaciones vencidas, enviar recordatorio de viaje del día siguiente. `pg_cron` corre dentro de la base de datos misma, así que no depende de que un proceso de servidor esté vivo (a diferencia del hilo de Python, que se perdía si el servidor se reiniciaba).

**Autenticación y seguridad:**

- **Supabase Auth** maneja registro, verificación de correo y sesiones. Las contraseñas se guardan con `bcrypt`, no SHA-256.
- **Actualización 2026-08-14:** originalmente planeamos verificación por código de 6 dígitos (OTP por correo), replicando el flujo de la tesina. Al implementarlo nos topamos con que, desde el 3 de junio de 2026, Supabase ya no permite personalizar las plantillas de correo (incluida la de "Confirm signup", necesaria para mandar un código en vez de un link) en proyectos nuevos del plan gratuito que usan su servicio de correo por default — solo con SMTP propio o plan de pago. Para no bloquear el avance ni sumar un proveedor de correo antes de tiempo, el registro usa **link mágico** (clic en el correo, sin escribir código) mientras el proyecto siga en el plan gratuito de Supabase. Si más adelante se conecta un SMTP propio (por ejemplo Resend, ya contemplado para recordatorios) o se sube de plan, se puede volver al flujo de código de 6 dígitos sin cambiar el esquema de base de datos, solo la plantilla de correo y la pantalla de registro.
- **Restricción a correo institucional (@itam.mx):** se implementa con un *Auth Hook* de Supabase que rechaza el registro si el dominio del correo no corresponde al de la institución. Esto es configurable, así que si el MVP eventualmente se abre a otras universidades para la demo de inversionistas, es un cambio de una lista, no de arquitectura.
- **Row Level Security (RLS):** cada tabla tiene políticas que garantizan que un usuario solo pueda ver/modificar sus propias reservaciones — reemplaza la función `checar_permisos()` que la tesina verificaba a mano en cada endpoint.

---

## 4. Frontend

**Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**, desplegado en **Vercel**.

- **Por qué Next.js y no React puro (Vite):** para una demo pública frente a inversionistas importa la primera impresión — Next.js renderiza HTML real en el servidor, así que la página carga visiblemente más rápido y es indexable por buscadores (útil si se comparte un link público de la demo). React puro renderiza todo en el navegador, lo cual se siente más lento y no tiene buen SEO.
- **shadcn/ui** da componentes ya accesibles y con buen diseño (formularios, botones, tablas) sin construirlos desde cero — permite que las 8 pantallas de la tesina (login, registro, home, reserva, cancelar, consultar, historial, mañana) se vean pulidas con poco esfuerzo de diseño.
- **TypeScript** comparte tipos con la base de datos (Supabase genera tipos automáticamente desde el esquema), reduciendo errores por campos mal nombrados que antes solo se detectaban en tiempo de ejecución.

---

## 5. Servicios externos

| Servicio | Uso | Notas |
|---|---|---|
| **Google Maps Platform** (Geocoding + Distance Matrix / Routes API) | Validar direcciones y calcular tiempos de viaje | Se mantiene igual que en la tesina; controlar llamadas con el pre-filtrado de PostGIS para cuidar la cuota gratuita |
| **Google Calendar API** | Crear evento al confirmar un viaje | Se mantiene igual que en la tesina |
| **Resend** | Correos de recordatorio y notificación (no los de verificación, esos los maneja Supabase Auth) | Nivel gratuito suficiente para el volumen de un MVP; mejor entregabilidad que SMTP manual |

---

## 6. Hosting e infraestructura

| Pieza | Dónde vive | Costo en fase de demo |
|---|---|---|
| Frontend + Route Handlers | Vercel | Gratuito (Hobby tier) |
| Base de datos + Auth + Edge Functions | Supabase | Gratuito hasta cierto volumen; el proyecto puede pausarse por inactividad en el plan gratuito, algo a vigilar antes de una demo en vivo |
| Dominio | A definir (ej. `carpool-itam.vercel.app` o dominio propio) | ~$12 USD/año si se compra dominio propio |

Con esta combinación, el costo de infraestructura durante la fase de demo es prácticamente $0, y escalar después (si hay inversión) es simplemente subir de plan en Vercel/Supabase sin reescribir nada.

---

## 7. Próximos pasos sugeridos

1. Diseño detallado del esquema de base de datos (tablas, políticas RLS) — ver boceto en sección 2.
2. Definir flujos de usuario (wireframes) para las pantallas clave, aprovechando shadcn/ui.
3. Levantar el proyecto base: repo, Supabase project, Vercel project conectados.
4. Implementar registro/login con correo institucional.
5. Implementar publicación de viaje y algoritmo de emparejamiento con PostGIS.
6. Integrar Google Maps y Google Calendar.
7. Pruebas de flujo completo (equivalente a la matriz de pruebas de la tesina) antes de la demo.

Este plan se lleva en [`PROGRESS.md`](./PROGRESS.md), que se irá marcando conforme avance el desarrollo.

---

## Referencias

- [FastAPI vs Flask vs Django in 2026](https://mecanik.dev/en/posts/python-web-framework-comparison-2026-django-vs-flask-vs-fastapi/)
- [PostgreSQL vs SQLite en 2026](https://mako.ai/guides/postgresql-vs-sqlite)
- [PostGIS Nearest-Neighbor Search — Crunchy Data](https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search)
- [React vs Next.js para MVP de SaaS en 2026 — Coderacle](https://www.coderacle.com/blog-details/react-vs-nextjs-for-saas-mvp-2026)
- [Mejores proveedores de autenticación 2026 — BuildMVPFast](https://www.buildmvpfast.com/blog/best-auth-providers-2026-clerk-supabase-comparison)
- [Google Maps API vs Mapbox 2026 — Radar](https://radar.com/blog/mapbox-vs-google-maps-api)
- [Railway vs Render vs Fly.io 2026 — PkgPulse](https://www.pkgpulse.com/guides/railway-vs-render-vs-fly-io-app-hosting-platforms-2026)
