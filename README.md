# WEPOOL — app

MVP de WEPOOL, una app de carpool institucional — el ITAM es el primer cliente/piloto, pero el producto está pensado para cualquier empresa o institución (ver [`docs/producto.md`](./docs/producto.md)). Next.js 15 (App Router) + TypeScript + Tailwind + Supabase. Ver el porqué de cada decisión técnica en [`docs/arquitectura_mvp.md`](./docs/arquitectura_mvp.md) y [`docs/esquema_base_datos.md`](./docs/esquema_base_datos.md), el pitch/modelo de negocio en [`docs/producto.md`](./docs/producto.md), y el guion para una demo en vivo en [`docs/guion_demo.md`](./docs/guion_demo.md). El estado del desarrollo se lleva en [`PROGRESS.md`](./PROGRESS.md).

El logo y la paleta de colores (azul de marca `#5170ff`) viven en `public/logo-mascot.png` (ícono) y `public/logo-lockup.png` (ícono + wordmark); el favicon (`app/icon.png`, `app/apple-icon.png`) sale del mismo archivo. Los tokens de color están en `app/globals.css` (`--brand`, `--primary`, etc.) — cambiar la marca es cambiar esos dos lugares, no cada pantalla.

La app es **instalable** (PWA) — desde Chrome/Edge de escritorio aparece un ícono de "Instalar" en la barra de direcciones, en Android Chrome ofrece "Agregar a la pantalla de inicio", y en iOS Safari es manual (compartir → "Agregar a inicio"). Ver `app/manifest.ts`, `public/sw.js`, y la decisión de por qué PWA y no una app nativa en `docs/producto.md` sección 12.

## Cómo arrancarlo

```bash
npm install
cp env-example.txt .env.local
```

(Se llama `env-example.txt` y no `.env.local.example` porque el puente con tu computadora no permite escribir archivos que empiecen con `.env` directamente — es solo cuestión de nombre, el contenido es la plantilla completa.)

Llena `.env.local` con los valores de tu proyecto de Supabase (Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` es la llave secreta (Settings → API → `service_role`) — solo se usa desde el servidor (`lib/supabase/admin.ts`, para el emparejamiento en `/consultar`) y nunca debe llevar el prefijo `NEXT_PUBLIC_`.

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Configuración pendiente en el panel de Supabase

1. **Redirect URLs del link de confirmación.** Ve a **Authentication → URL Configuration → Redirect URLs** y agrega `http://localhost:3000/auth/callback` y la URL de producción de Vercel (`https://<tu-dominio>.vercel.app/auth/callback`). Sin esto, el link del correo de confirmación no va a poder regresar a la app.
2. **Auth Hook de dominio institucional.** **Authentication → Hooks → Before User Created** → función `restrict_signup_to_itam_domain`.
3. **Migraciones aplicadas.** Todo lo que esté en `supabase/migrations/` debe correrse en el proyecto real (SQL Editor del panel, o `supabase db push`).

> **Nota:** el registro confirma por **link mágico**, no por código de 6 dígitos como en la tesina. Desde el 3 de junio de 2026, Supabase no deja personalizar plantillas de correo (necesario para mandar un código en vez de un link) en proyectos nuevos del plan gratuito sin SMTP propio. Cuando se conecte un SMTP propio (Resend, ya contemplado para recordatorios) se puede volver al flujo de código — ver la nota "Actualización 2026-08-14" en `docs/arquitectura_mvp.md`.

## Estructura

```
app/
  (auth)/login/          → /login
  (auth)/registro/       → /registro (registro, confirma por link mágico al correo)
  auth/callback/          → intercambia el código del link mágico por una sesión
  (app)/home/            → /home
  (app)/reserva/         → /reserva (publicar/reservar viaje — conductor/pasajero × ida/regreso)
  (app)/cancelar/        → /cancelar (cancelar una reservación activa)
  (app)/consultar/       → /consultar (emparejamiento y confirmación de viaje)
  (app)/historial/       → /historial (viajes ya confirmados)
  (app)/manana/          → /manana (viajes confirmados para el día siguiente)
  manifest.ts             → manifest de la PWA (nombre, iconos, colores) — Next.js lo sirve solo en /manifest.webmanifest
lib/
  supabase/client.ts     → cliente para Client Components
  supabase/server.ts     → cliente para Server Components/Actions (respeta RLS)
  supabase/admin.ts      → cliente con la llave de servicio (salta RLS; solo para Server Actions)
  actions/                → Server Actions (reserva, cancelar, consultar)
  geocoding.ts            → geocoding de direcciones (Nominatim, temporal — ver PROGRESS.md Fase 4)
  datetime.ts             → regla "solo para mañana" y conversiones de zona horaria (CDMX)
components/ui/            → Button, Input, Label, Card (estilo shadcn/ui, escritos a mano)
components/register-sw.tsx → registra el service worker de la PWA (public/sw.js)
public/sw.js               → service worker de la PWA — solo cachea el app shell estático, nunca datos de Supabase
public/icons/              → iconos de instalación (192/512/maskable)
supabase/migrations/       → esquema de base de datos (ver docs/esquema_base_datos.md)
e2e/                       → tests end-to-end (Playwright), ver sección "Tests" abajo
scripts/seed.ts             → datos de ejemplo para la demo, ver sección "Datos de ejemplo" abajo
docs/
  arquitectura_mvp.md      → por qué cada decisión técnica (Next.js + Supabase, PostGIS, etc.)
  esquema_base_datos.md    → esquema de base de datos en detalle
  producto.md              → pitch, modelo de negocio, mercado, roadmap
  guion_demo.md            → narrativa pantalla por pantalla para una demo en vivo
```

## Lo que ya funciona

- Registro con correo institucional + confirmación por link mágico al correo.
- Login / logout con sesión persistente (cookies, vía middleware).
- Rutas protegidas: si no hay sesión, el middleware manda a `/login`.
- Publicar/reservar viaje (conductor o pasajero, ida o regreso) con geocoding real de la dirección.
- Cancelar una reservación activa.
- Emparejamiento geoespacial (PostGIS) y confirmación de viaje entre conductor y pasajero.
- Historial de viajes y vista "viajes de mañana".

Ver `PROGRESS.md` para el detalle de lo que falta (Fase 4: Google Maps/Calendar/Resend; Fase 5: pulido para demo).

## Tests

Suite end-to-end con [Playwright](https://playwright.dev) que cubre el flujo completo de la demo: dos usuarios de prueba (conductor y pasajero) publican viajes compatibles, se emparejan, ambos confirman, y el viaje aparece en "mañana" para los dos.

Los tests corren sobre el **Google Chrome que ya tienes instalado** (`channel: "chrome"` en `playwright.config.ts`), no sobre un Chromium descargado por Playwright — así que no hace falta ningún setup de navegador. (Se hizo así porque Playwright dejó de publicar binarios de Chromium para macOS anteriores a Sonoma/14; si intentas `npx playwright install chromium` en una Mac más vieja falla con `Playwright does not support chromium on macXX`.)

Correr los tests contra tu servidor local (`npm run dev` se levanta solo si no está corriendo ya):

```bash
npm run test:e2e
```

Correr contra el deploy real de Vercel, para probar la demo tal como la va a ver un inversionista:

```bash
PLAYWRIGHT_BASE_URL=https://<tu-dominio>.vercel.app npm run test:e2e
```

Modo interactivo (útil para depurar un test que falla):

```bash
npm run test:e2e:ui
```

Los usuarios de prueba (`e2e.conductor@itam.mx`, `e2e.pasajero@itam.mx`) se crean automáticamente antes de correr la suite (`e2e/global-setup.ts`), usando `SUPABASE_SERVICE_ROLE_KEY` para saltarse el flujo de correo — por eso esa variable es obligatoria en `.env.local` para correr los tests, aunque la app en sí solo la necesita para `/consultar`.

## Datos de ejemplo (seed)

`scripts/seed.ts` llena el proyecto con una comunidad ITAM de ejemplo para la demo: 8 usuarios @itam.mx (nombres y direcciones de zonas reales de CDMX — Santa Fe, Interlomas, Del Valle, Coyoacán), 4 vehículos, y 4 parejas conductor/pasajero — 2 ya confirmadas (para que `/manana` e `/historial` tengan contenido de inmediato) y 2 sin emparejar todavía (para mostrar en vivo el algoritmo de emparejamiento y el flujo de confirmación en `/consultar`).

**Requiere que `supabase/migrations/0004_instituciones.sql` ya esté aplicada** (crea la tabla `institutions` — el script falla con un mensaje claro si no la encuentra).

Los viajes son siempre "para mañana", así que hay que correr el seed el día antes de cada demo, no con anticipación:

```bash
npm run seed
```

Al final imprime la contraseña de los usuarios de demo — inicia sesión con cualquiera de los 8 correos @itam.mx que muestra la terminal para recorrer la demo. Correrlo de nuevo limpia y vuelve a crear los datos de estos mismos 8 usuarios, así que es seguro repetirlo.
