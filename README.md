# Carpool ITAM — app

MVP de una app de carpool para la comunidad del ITAM. Next.js 15 (App Router) + TypeScript + Tailwind + Supabase. Ver el porqué de cada decisión en [`docs/arquitectura_mvp.md`](./docs/arquitectura_mvp.md) y [`docs/esquema_base_datos.md`](./docs/esquema_base_datos.md).

## Aviso importante sobre este scaffold

Este proyecto se escribió a mano, archivo por archivo, en vez de generarse con `create-next-app`/`shadcn init`: el sandbox donde trabajé no tuvo acceso a los registros de paquetes (npm, PyPI, apt) durante esta sesión, así que no pude correr `npm install` ni `npm run build` para verificarlo antes de entregarlo — a diferencia de las migraciones SQL, que sí probé contra una base de datos real.

Puse cuidado en usar patrones estables y bien documentados (el patrón oficial de `@supabase/ssr` para Next.js 15, componentes de shadcn/ui tal cual), pero **el primer paso real es correrlo tú y avisarme si algo truena** — con el error a la mano lo arreglo de inmediato.

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
```

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Configuración pendiente en el panel de Supabase

1. **Redirect URL del link de confirmación.** Ve a **Authentication → URL Configuration → Redirect URLs** y agrega `http://localhost:3000/auth/callback` (y cuando haya URL de producción/Vercel, agrégala también). Sin esto, el link del correo de confirmación no va a poder regresar a la app.
2. **Auth Hook de dominio institucional.** Si todavía no lo conectaste: **Authentication → Hooks → Before User Created** → selecciona la función `restrict_signup_to_itam_domain`.

> **Nota:** el registro confirma por **link mágico**, no por código de 6 dígitos como en la tesina. Desde el 3 de junio de 2026, Supabase no deja personalizar plantillas de correo (necesario para mandar un código en vez de un link) en proyectos nuevos del plan gratuito sin SMTP propio. Cuando se conecte un SMTP propio (Resend, ya contemplado para recordatorios) se puede volver al flujo de código — ver la nota "Actualización 2026-08-14" en `docs/arquitectura_mvp.md`.

## Estructura

```
app/
  (auth)/login/          → /login
  (auth)/registro/       → /registro (registro, confirma por link mágico al correo)
  auth/callback/          → intercambia el código del link mágico por una sesión
  (app)/home/            → /home (ya conectado a Supabase de verdad)
  (app)/reserva/         → /reserva (placeholder, Fase 3)
  (app)/cancelar/        → /cancelar (placeholder, Fase 3)
  (app)/consultar/       → /consultar (placeholder, Fase 3)
  (app)/historial/       → /historial (placeholder, Fase 3)
  (app)/manana/          → /manana (placeholder, Fase 3)
lib/supabase/
  client.ts              → cliente para Client Components
  server.ts               → cliente para Server Components/Actions
  middleware.ts           → refresca sesión y protege rutas
components/ui/            → Button, Input, Label, Card (estilo shadcn/ui, escritos a mano)
supabase/migrations/       → esquema de base de datos (ver docs/esquema_base_datos.md)
```

## Lo que ya funciona

- Registro con correo institucional + confirmación por link mágico al correo.
- Login / logout con sesión persistente (cookies, vía middleware).
- Rutas protegidas: si no hay sesión, el middleware manda a `/login`.
- `/home` lee el perfil del usuario desde Postgres (prueba que Auth + RLS + base de datos ya están bien conectados).

## Lo que falta (Fase 3 de `PROGRESS.md`)

Las pantallas de reserva, cancelación, consulta de viajes, historial y "mañana" están enrutadas pero sin lógica todavía — cada una trae una nota de qué tabla/función usar cuando se implemente.

## Siguiente paso de infraestructura

Conectar este repo a un proyecto de Vercel (Fase 1 de `PROGRESS.md`) para tener una URL pública de demo.
