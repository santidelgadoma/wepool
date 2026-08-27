# Casos de uso — WEPOOL (para automatizar en Playwright)

**Objetivo de este documento:** enumerar TODOS los casos de uso que hoy existen en el producto, para dos cosas a la vez: (1) servir de backlog para escribir specs nuevos de Playwright, y (2) dar una foto honesta de qué tan lista está la demo — qué funciona, qué ya está cubierto por pruebas automatizadas, y qué gaps encontré al hacer este barrido completo del código.

**Método:** cada caso de uso de abajo viene de leer el código real (`app/`, `lib/actions/`, `components/`) tal como está HOY, no de `docs/producto.md` ni `docs/guion_demo.md` — esos dos documentos describen el flujo de `/consultar` como era ANTES de "Solicitudes urgentes" (ver `PROGRESS.md`, 2026-08-19) y quedaron desactualizados en ese punto específico. Lo marco explícitamente en la sección de hallazgos al final.

**Convención de selectores:** todos los botones y links de acción del producto ya tienen `id` fijo (agregado a lo largo de esta sesión, ver `PROGRESS.md`) — los casos de abajo referencian esos ids donde aplica, para que escribir cada spec sea mecánico.

**Relacionado:** [`producto.md`](./producto.md) (pitch y modelo de negocio), [`guion_demo.md`](./guion_demo.md) (narrativa de la demo — desactualizado en el paso 4, ver hallazgos), [`esquema_base_datos.md`](./esquema_base_datos.md) (esquema), [`../PROGRESS.md`](../PROGRESS.md) (bitácora técnica), [`../e2e/`](../e2e/) (specs de Playwright ya escritos).

---

## Cómo leer las tablas

- **ID**: identificador corto para referenciar el caso en commits/specs (`CU-COND-03`, etc.).
- **Prioridad para demo**: 🔴 Alta (se ve o se menciona en `guion_demo.md`, o es la ruta principal de un flujo) / 🟡 Media (importante para que el producto se sienta completo, no aparece en la demo de 10 min) / ⚪ Baja (edge case / caso de error, vale la pena tener cubierto pero no bloquea una demo).
- **Automatización**: ✅ Cubierto hoy (spec existente) / 🟨 Parcial (se ejercita indirectamente dentro de otro spec, pero no se valida explícitamente) / ⬜ No cubierto.

---

## A. Comunes a ambos roles — autenticación y navegación

| ID | Caso de uso | Precondición | Pasos | Resultado esperado | Prioridad | Automatización |
|---|---|---|---|---|---|---|
| CU-COM-01 | Registro con correo institucional válido | Ninguna | `/registro` → llenar nombre/celular/correo `@<dominio dado de alta>`/contraseña → `#registro-submit` | Se muestra pantalla "Revisa tu correo" (no hay sesión todavía) | 🔴 Alta (se narra, no se ejecuta en vivo — ver `guion_demo.md` paso 2) | ⬜ No cubierto (depende de un correo real, ver hallazgo H-3) |
| CU-COM-02 | Registro con dominio de correo NO dado de alta | Ninguna | Igual que CU-COM-01 pero con un correo de dominio no registrado en `institutions` | El Auth Hook `restrict_signup_to_itam_domain` rechaza el alta — se muestra `state.error` | 🟡 Media | ⬜ No cubierto |
| CU-COM-03 | Confirmar cuenta vía link mágico | Registro enviado (CU-COM-01) | Abrir el link del correo → `GET /auth/callback?code=...` | Sesión creada, redirige a `/home` (o a `next` si venía en el link) | 🟡 Media | ⬜ No cubierto (mismo motivo que H-3) |
| CU-COM-04 | Link mágico inválido o ya usado | Un `code` vencido/reusado | `GET /auth/callback?code=<inválido>` | Redirige a `/login?error=auth_callback_failed` | ⚪ Baja | ⬜ No cubierto |
| CU-COM-05 | Login con credenciales válidas | Usuario ya existente | `/login` → `#email`, `#password` → `#login-submit` | Redirige a `/home` | 🔴 Alta | ✅ Cubierto (`e2e/helpers.ts::login`, usado en ambos specs) |
| CU-COM-06 | Login con credenciales inválidas | — | Igual que CU-COM-05 con contraseña incorrecta | `state.error` visible (mensaje de Supabase), se queda en `/login` | 🟡 Media | ⬜ No cubierto |
| CU-COM-07 | Cerrar sesión | Sesión activa | Clic en `#logout-button` (visible en el header, versión desktop y mobile) | Vuelve a `/login`; cualquier ruta protegida vuelve a rebotar a `/login` | 🟡 Media | ⬜ No cubierto |
| CU-COM-08 | Acceder a una ruta protegida sin sesión | Sin sesión (o después de CU-COM-07) | `goto("/home")` (o `/reserva`, `/consultar`, `/manana`, `/historial`, `/cancelar`) directo | El middleware (`lib/supabase/middleware.ts`) redirige a `/login` | 🟡 Media | 🟨 Parcial (se ve indirectamente cuando algo sale mal en login, nunca se afirma explícitamente) |
| CU-COM-09 | Navegar entre pantallas con `AppNav` | Sesión activa | Clic en cada link del nav (`#nav-home`, `#nav-reserva`, `#nav-consultar`, `#nav-manana`, `#nav-historial`, `#nav-cancelar`) | Navega a la ruta correcta; el link activo se resalta (`aria-current="page"`) | ⚪ Baja | ⬜ No cubierto explícitamente (se navega mucho vía `page.goto()` directo en los specs actuales, no clicando el nav) |
| CU-COM-10 | Cambiar de ubicación guardada en el feed | Al menos 2 ubicaciones guardadas (casa + oficina, p.ej.) | En `/home`, clic en `#loc-oficina` (o `#loc-otro`) | El feed recarga con la ubicación elegida (`?loc=oficina`), el switcher marca la activa | ⚪ Baja | ⬜ No cubierto |

---

## B. Conductor

| ID | Caso de uso | Precondición | Pasos | Resultado esperado | Prioridad | Automatización |
|---|---|---|---|---|---|---|
| CU-COND-01 | Publicar viaje de ida, vehículo nuevo | Sesión activa | `/reserva` → `#role-conductor` → `#direction-ida` → `#homeAddress`, `#scheduledTime` → placas/descripción → `#toll-roads-true`/`false` → `#publicar-viaje-submit` | Redirige a `/home?publicado=1`, banner `#publicado-banner` visible | 🔴 Alta (paso 3 de `guion_demo.md`) | ✅ Cubierto (`e2e/helpers.ts::publicarViaje`, usado en ambos specs) |
| CU-COND-02 | Publicar viaje reusando un vehículo ya registrado | Ya tiene ≥1 vehículo (de un CU-COND-01 previo) | Igual que arriba, pero eligiendo el `<select>` de vehículo en vez de llenar placas/descripción nuevas | Publica sin volver a pedir placas/descripción | ⚪ Baja | ⬜ No cubierto (los specs siempre registran un vehículo nuevo) |
| CU-COND-03 | Publicar viaje de regreso, con punto de encuentro | Sesión activa | Igual que CU-COND-01 con `#direction-regreso` → llenar `#meetingPoint` | Publica correctamente, `meeting_point` guardado | 🟡 Media | ⬜ No cubierto (los specs solo publican `ida`) |
| CU-COND-04 | Publicar de regreso SIN punto de encuentro | — | Igual que CU-COND-03 sin llenar `#meetingPoint` | `fieldErrors.meetingPoint`, no publica | ⚪ Baja | ⬜ No cubierto |
| CU-COND-05 | Publicar sin elegir "¿usas vías de cuota?" | — | Omitir el clic en `#toll-roads-true`/`false` | `fieldErrors.usesTollRoads`, no publica | ⚪ Baja | ⬜ No cubierto |
| CU-COND-06 | Publicar con dirección no geocodificable | — | `#homeAddress` con texto sin sentido (p.ej. `"asdkjaslkdj"`) | Mensaje de error de geocoding en el campo, no publica | ⚪ Baja | ⬜ No cubierto |
| CU-COND-07 | Ver estimado de precio/ganancia en vivo | Institución con `campus_lat/lng` configurado | Llenar `#homeAddress`, salir del campo (blur) | Aparece `Badge` verde "Ganarías ~$X" antes de publicar | ⚪ Baja | ⬜ No cubierto |
| CU-COND-08 | Recibir solicitud urgente y **aceptar** (banner global) | Un pasajero ya eligió su viaje (CU-PAS-04) | En CUALQUIER pantalla, el banner ámbar aparece con `<SolicitudCard urgente>` → clic `#aceptar-<matchId>` | Se crea `confirmed_trips`, ambas ofertas → `confirmado`, banner desaparece, viaje visible en `/manana` para ambos | 🔴 Alta (corazón de la demo, paso 4) | ✅ Cubierto (`feed-flow.spec.ts`, vía `/consultar` en vez del banner — ver H-2) |
| CU-COND-09 | Recibir solicitud urgente y **rechazar** | Igual que arriba | Clic `#rechazar-<matchId>` | Oferta propia vuelve a `buscando` (visible de nuevo en el feed de otros pasajeros), la del pasajero pasa a `rechazado` | 🟡 Media | ✅ `e2e/rechazo-flow.spec.ts` |
| CU-COND-10 | Ver y responder solicitudes desde `/consultar` (no el banner) | Igual que CU-COND-08 | `/consultar` → sección "Solicitudes por responder" → `#aceptar-<matchId>` o `#rechazar-<matchId>` | Mismo resultado que CU-COND-08/09 | 🔴 Alta | ✅ Cubierto (`demo-flow.spec.ts` y `feed-flow.spec.ts` usan este camino) |
| CU-COND-11 | Cancelar oferta propia en `buscando` | Oferta publicada, nadie la ha elegido | `/cancelar` → `#cancelar-<offerId>` | Oferta eliminada, ya no aparece en ningún feed/candidatos | 🟡 Media | ✅ Cubierto (`e2e/cancelacion-flow.spec.ts`) |
| CU-COND-12 | Cancelar oferta propia en `pendiente` (con un pasajero esperando) | Un pasajero ya la eligió (CU-PAS-04), conductor no ha respondido | `/cancelar` → `#cancelar-<offerId>` en una oferta con badge "Esperando respuesta" | Oferta eliminada; la oferta del pasajero pasa a `rechazado` (le llega el mismo aviso que un rechazo real) | 🟡 Media | ✅ Cubierto (`e2e/cancelacion-flow.spec.ts`) |
| CU-COND-13 | Ver viaje confirmado en `/manana` | Viaje aceptado (CU-COND-08) | `/manana` | Tarjeta con rol "Conductor", dirección, hora, punto de encuentro (si es regreso), ganancia | 🔴 Alta (paso 5) | ✅ Cubierto (ambos specs verifican `/^Conductor/` o similar) |
| CU-COND-14 | Ver historial como conductor | ≥1 viaje ya confirmado (aunque sea de "mañana", `/historial` no filtra por fecha) | `/historial` | Tarjeta con status (programado/completado/cancelado) y "Ganaste ~$X" | 🟡 Media (paso 5, opcional en `guion_demo.md`) | ⬜ No cubierto |

---

## C. Pasajero

| ID | Caso de uso | Precondición | Pasos | Resultado esperado | Prioridad | Automatización |
|---|---|---|---|---|---|---|
| CU-PAS-01 | Guardar ubicación "Casa" por primera vez | Sin ubicaciones guardadas | `/home` → `#address-casa` → `#guardar-ubicacion-casa` | El formulario desaparece, se muestra "Cerca de `<dirección>`" y el feed | 🔴 Alta | ✅ Cubierto (`e2e/helpers.ts::guardarUbicacionCasa`, `feed-flow.spec.ts`) |
| CU-PAS-02 | Editar una ubicación ya guardada | Ya tiene "Casa" guardada | `/home` → abrir `<details>` "Cambiar dirección" → nueva dirección → guardar | La dirección mostrada se actualiza | ⚪ Baja | ⬜ No cubierto |
| CU-PAS-03 | Ver el feed con viajes disponibles | Ubicación guardada, ≥1 conductor publicó cerca | `/home` | Tarjetas ordenadas, cada una con conductor, dirección, precio, hora, distancia | 🔴 Alta | ✅ Cubierto (`feed-flow.spec.ts`) |
| CU-PAS-03b | Feed vacío (nadie ha publicado cerca) | Ubicación guardada, sin conductores cerca | `/home` | Mensaje "Todavía no hay viajes publicados cerca de aquí" | ⚪ Baja | ⬜ No cubierto |
| CU-PAS-04 | Elegir un viaje del feed | Contexto de CU-PAS-03 | Clic en `#unirme-<driverOfferId>` de una tarjeta | Mensaje local "¡Te uniste! Esperando confirmación del conductor.", ambas ofertas → `pendiente` | 🔴 Alta | ✅ Cubierto (`feed-flow.spec.ts`) |
| CU-PAS-05 | Las demás tarjetas de esa dirección desaparecen tras elegir | Justo después de CU-PAS-04, con ≥2 conductores publicados en esa dirección | Refrescar/esperar el `router.refresh()` automático | TODAS las tarjetas "Unirme a este viaje" de esa dirección desaparecen (no solo la elegida); aparece tarjeta de estado "esperando respuesta del conductor" | 🔴 Alta (era el bug reportado por captura de pantalla) | ✅ Cubierto (`feed-flow.spec.ts` — regresión explícita) |
| CU-PAS-06 | La dirección OPUESTA sigue disponible mientras la elegida está bloqueada | Pendiente de `ida`, viajes de `regreso` también publicados | `/home` con ambas direcciones activas | El feed de `regreso` se sigue viendo normal; solo `ida` está bloqueada | 🟡 Media | ⬜ No cubierto |
| CU-PAS-07 | El conductor acepta → pasajero ve "confirmado" | CU-COND-08/10 ya ejecutado | `/home` | Tarjeta verde "Ya tienes un viaje de `<dirección>` confirmado" con link a `/manana` | 🔴 Alta | ✅ Cubierto (ambos specs) |
| CU-PAS-08 | El conductor rechaza → pasajero ve aviso una sola vez | CU-COND-09 ya ejecutado | `/home` (primera visita tras el rechazo) | Tarjeta roja "El conductor rechazó tu solicitud de `<dirección>`"; en la SIGUIENTE visita ya no aparece (se borra sola al leerse) | 🟡 Media | ✅ `e2e/rechazo-flow.spec.ts` |
| CU-PAS-08b | Tras el rechazo, el pasajero puede elegir otro viaje de esa dirección | Justo después de CU-PAS-08 | `/home` | El feed de esa dirección vuelve a mostrarse (ya no bloqueado) | 🟡 Media | ✅ `e2e/rechazo-flow.spec.ts` |
| CU-PAS-09 | Feed en tiempo real: aparece un viaje nuevo sin recargar | Pasajero con el feed abierto, sin solicitud pendiente | En OTRA pestaña, un conductor publica un viaje compatible | La tarjeta nueva aparece sola (con debounce ~600ms) sin que el pasajero recargue | 🟡 Media (feature nueva, no probada nunca en vivo — ver `PROGRESS.md`) | ⬜ No cubierto (difícil con Playwright por timing de WebSocket — ver hallazgo H-4) |
| CU-PAS-10 | Publicar como pasajero vía `/reserva` (flujo manual) | Sesión activa | Igual que CU-COND-01 pero con `#role-pasajero` (sin vehículo/cuota) | Publica, redirige a `/home?publicado=1` | 🟡 Media | ⬜ No cubierto (los specs solo usan el feed o publican como conductor) |
| CU-PAS-11 | Ver candidatos en `/consultar` tras publicar manualmente | CU-PAS-10 + un conductor compatible publicado | `/consultar` | Lista de candidatos con rol, dirección, hora, precio | 🔴 Alta | ✅ Cubierto (`demo-flow.spec.ts`) |
| CU-PAS-12 | Elegir un candidato desde `/consultar` | Contexto de CU-PAS-11 | Clic `#elegir-<matchId>` | Mismo resultado que CU-PAS-04 (ambas ofertas → `pendiente`) | 🔴 Alta | ✅ Cubierto (`demo-flow.spec.ts`) |
| CU-PAS-13 | Bloqueo al intentar elegir un segundo viaje de la misma dirección | Ya tiene una solicitud pendiente/confirmada de `ida` | Intentar `unirmeAViaje` o `elegirCandidato` de otra oferta de `ida` (vía dos pestañas o llamando la Server Action directo) | Error "Ya tienes una solicitud... en curso" — defensa en profundidad, la UI normal ya no debería ni mostrar la opción | ⚪ Baja (carrera / defensa, no un flujo de UI normal) | ⬜ No cubierto |
| CU-PAS-14 | Cancelar oferta propia (`buscando` o `pendiente`) | Oferta propia activa | `/cancelar` → `#cancelar-<offerId>` | Igual que CU-COND-11/12, del lado pasajero | 🟡 Media | ✅ Cubierto (`e2e/cancelacion-flow.spec.ts`) |
| CU-PAS-15 | Ver viaje confirmado en `/manana` | Viaje aceptado | `/manana` | Tarjeta con rol "Pasajero", precio pagado | 🔴 Alta | ✅ Cubierto (ambos specs) |
| CU-PAS-16 | Ver historial como pasajero | ≥1 viaje confirmado | `/historial` | Tarjeta con "Pagaste ~$X" | 🟡 Media | ⬜ No cubierto |

---

## D. Flujos completos (end-to-end)

| ID | Caso de uso | Automatización |
|---|---|---|
| CU-E2E-01 | Conductor y pasajero se emparejan por el camino MANUAL (`/reserva` → `/consultar` en ambos lados → aceptar) hasta verse en `/manana` | ✅ `demo-flow.spec.ts` |
| CU-E2E-02 | Pasajero navega el feed del home, elige entre ≥2 conductores, el resto desaparece, el conductor acepta, se confirma | ✅ `feed-flow.spec.ts` |
| CU-E2E-03 | Ciclo completo de RECHAZO: pasajero elige → conductor rechaza → pasajero ve el aviso → elige un viaje DISTINTO de la misma dirección → se confirma | ✅ `e2e/rechazo-flow.spec.ts` (verificado: corre limpio, ver `PROGRESS.md` 2026-08-21) |
| CU-E2E-04 | Feed en tiempo real de punta a punta: pasajero con el feed abierto en una pestaña, conductor publica en otra, la tarjeta aparece sola | ⬜ No cubierto — ver hallazgo H-4 sobre la dificultad de automatizar esto de forma no-flaky |
| CU-E2E-05 | Conductor cancela una oferta `pendiente` mientras el pasajero espera → el pasajero recibe el mismo aviso que un rechazo | ✅ `e2e/cancelacion-flow.spec.ts` |
| CU-E2E-06 | Pasajero cancela mientras espera respuesta → la oferta del conductor vuelve a `buscando` (sin aviso especial) y aparece de nuevo en el feed de otros pasajeros | ✅ `e2e/cancelacion-flow.spec.ts` |
| CU-E2E-07 | Registro real de un usuario nuevo → confirma por correo → publica su primer viaje | ⬜ No cubierto (depende de un correo real, ver H-3) |
| CU-E2E-08 | Viaje se confirma → conductor y pasajero chatean en tiempo real desde `/manana` → ambos ven los mensajes del otro sin recargar | ⬜ No cubierto |
| CU-E2E-09 | Viaje se confirma → `complete_past_confirmed_trips()` lo marca `completado` → ambas partes se califican desde `/historial` → el promedio aparece en la tarjeta del otro en `/manana`/`/historial` | ⬜ No cubierto (requiere adelantar `scheduled_time` o esperar el cron, ver hallazgo nuevo en sección E) |

---

## E. Hallazgos de esta revisión

1. **`docs/guion_demo.md` (paso 4) y `docs/producto.md` (§3, punto 4) están desactualizados respecto al flujo real de confirmación.** Ambos describen "el pasajero elige un viaje/conductor, el conductor confirma al pasajero (o viceversa)" desde `/consultar` con un botón "Elegir este viaje" del lado del conductor — eso ya no existe. Desde "Solicitudes urgentes" (`PROGRESS.md`, 2026-08-19), el conductor SIEMPRE responde con Aceptar/Rechazar (banner urgente o sección "Solicitudes por responder"), nunca con "Elegir este viaje". Antes de la próxima demo real, vale la pena actualizar el guion (y ensayarlo con el flujo actual) para no describir en voz alta un botón que ya no está en pantalla.
2. **La demo actual (`guion_demo.md`) usa el camino MANUAL (`/reserva` → `/consultar`), no el feed del home**, aunque el feed (`/home`) es la experiencia más nueva y pulida (rediseño 2026-08-18) y la que tiene la regresión de bug ya corregida y probada (CU-PAS-05). Vale la pena considerar actualizar el guion para mostrar el feed en vez del flujo manual — es más parecido a lo que un inversionista espera ver ("tipo Rappi/BlaBlaCar", como dice el propio código).
3. **El registro real (CU-COM-01/03) y el feed en tiempo real (CU-PAS-09) son difíciles de automatizar de forma confiable hoy.** El registro depende de recibir un correo real (por eso `e2e/global-setup.ts` usa `admin.auth.admin.createUser` para saltárselo) — para probar el flujo de UI de principio a fin haría falta un buzón de prueba real o correr Supabase local con Inbucket, ninguno de los dos está configurado todavía. El feed en tiempo real depende de timing de WebSocket + un debounce de 600ms — es automatizable, pero con más riesgo de "flakiness" que el resto de la suite; si se agrega, debe tener su propio margen de espera generoso y no debe bloquear el resto de la suite si falla.
4. **Gap de producto, no de pruebas: no existe forma de cancelar un viaje YA CONFIRMADO.** `/cancelar` (`app/(app)/cancelar/page.tsx`) solo lista ofertas en `buscando`/`pendiente` — una vez que pasa a `confirmado` (`confirmed_trips`), no hay ningún botón en la UI para cancelarlo. Puede ser una omisión deliberada (fuera de alcance del MVP) o un hueco real — vale la pena confirmar con el fundador si es un caso de uso que falta antes de un piloto real con usuarios (hoy alguien que se arrepiente de un viaje ya confirmado no tiene ninguna salida en la app).
5. **No hay pantalla de "olvidé mi contraseña".** No se encontró ninguna ruta `/reset-password` ni similar — otro punto a confirmar si es alcance deliberado del MVP o un hueco.
6. **Antes de escribir specs nuevos, aplicar el plan de estabilidad ya usado en `feed-flow.spec.ts` / `demo-flow.spec.ts`:** usuarios de prueba DEDICADOS y separados por spec (nunca reusar `CONDUCTOR`/`PASAJERO` entre archivos nuevos), `workers: 1` ya está fijo en `playwright.config.ts` (ver `PROGRESS.md`, corrida del 2026-08-19), y localizar SIEMPRE por `id` — ya no debería hacer falta ningún `getByRole(..., { name: "texto visible" })` nuevo, con la cobertura de ids que ya existe en todo el producto.
7. **Usuarios de prueba dedicados NO bastan para aislar specs que publican más de un conductor por dirección — también hace falta aislar la geografía y limpiar lo que quede `buscando`.** `obtenerFeed` (`lib/actions/feed.ts`, usado por el feed del home) filtra por día completo y un radio de 15km, sin ventana de hora — así que una oferta de conductor que ningún pasajero reclamó al terminar un spec se queda `buscando` para siempre y aparece en el feed de CUALQUIER OTRO spec que publique dentro de esos 15km, sin importar qué usuarios use. Esto rompió `rechazo-flow.spec.ts` (veía 3 candidatos en vez de 2) porque reusaba el mismo tramo de calle que `feed-flow.spec.ts`. Ver `CLAUDE.md` para la convención completa y `PROGRESS.md` (2026-08-21) para el diagnóstico.
8. **Probar CU-RATE-*/CU-E2E-09 en Playwright requiere que un viaje pase por `completado`, y eso depende de un `pg_cron` cada 15 minutos** (`complete_past_confirmed_trips()`, `0011_calificaciones.sql`) — no es viable esperarlo en un spec normal. Dos caminos: (a) el spec llama la función SQL directo con el cliente admin (`admin.rpc` o un `update` directo a `confirmed_trips.status`) para forzar el estado sin esperar el cron — el camino recomendado, ya que además evita depender de que el cron esté corriendo en el entorno de pruebas; (b) crear el `confirmed_trip` de prueba con `scheduled_time` ya en el pasado y esperar el cron real, mucho más lento y menos confiable. Documentar esto en el spec cuando se escriba.

---

## F. Resumen de cobertura actual

De los **~50 casos de uso** identificados arriba (sin contar variaciones de error triviales), **20** están cubiertos hoy por `demo-flow.spec.ts` + `feed-flow.spec.ts` + `rechazo-flow.spec.ts` + `cancelacion-flow.spec.ts` (los marcados ✅). Los cuatro specs ya corren de verdad contra el proyecto real de Supabase (dos corridas limpias consecutivas, ver `PROGRESS.md` 2026-08-21) — con `rechazo-flow.spec.ts` se prueba el camino de "rechazar" (CU-COND-09, CU-PAS-08, CU-PAS-08b) y con `cancelacion-flow.spec.ts` los tres caminos de cancelación (CU-COND-11/12, CU-PAS-14, CU-E2E-05/06), además del "camino feliz" de publicar/emparejar/confirmar. Quedan sin spec propio las validaciones de formulario, el viaje de `regreso`, y la capa de auth explícita — la lógica de negocio para casi todos ellos ya existe con manejo de errores explícito en cada `lib/actions/*.ts`.

**Sugerencia de orden para los próximos specs** (de más a menos valioso para una demo/piloto real):
1. ~~CU-E2E-03 (ciclo de rechazo completo)~~ — ✅ `e2e/rechazo-flow.spec.ts`, verificado.
2. ~~CU-COND-11/12 y CU-PAS-14 (cancelaciones)~~ — ✅ `e2e/cancelacion-flow.spec.ts`, verificado.
3. CU-COND-03/04 (viaje de regreso + validación de punto de encuentro) — hoy CERO specs publican un viaje de `regreso`, es la mitad del producto sin cobertura.
4. Validaciones de formulario en `/reserva` (CU-COND-04/05/06) — rápidas de escribir, atrapan regresiones de Zod baratas.
5. CU-COM-05/06/07/08 (login inválido, logout, ruta protegida sin sesión) — barato de escribir, cubre la capa de auth que hoy nunca se prueba explícitamente (solo se usa indirectamente dentro de `login()`).
6. CU-PAS-09 / CU-E2E-04 (feed en tiempo real) — al final, por el riesgo de flakiness mencionado en el hallazgo H-3.

Este documento no incluye código de Playwright todavía — es el mapa para escribirlo. Dime con cuáles casos de uso quieres que arranque y sigo con los specs.

---

## G. Chat (nueva — ver `docs/diseno_chat_y_calificaciones.md` sección A)

| ID | Caso de uso | Precondición | Pasos | Resultado esperado | Prioridad | Automatización |
|---|---|---|---|---|---|---|
| CU-CHAT-01 | Conductor y pasajero con viaje confirmado intercambian mensajes y ambos los ven en tiempo real sin recargar | Viaje confirmado (CU-COND-08/CU-PAS-07) | `/manana` → `#chat-link-<tripId>` → escribir en `#mensaje-input` → `#enviar-mensaje-submit`; repetir del otro lado en OTRA pestaña | El mensaje aparece como burbuja (`#mensaje-<id>`) del lado de quien lo mandó y, sin recargar, también del lado de la contraparte | 🔴 Alta (funcionalidad nueva, corazón de la coordinación post-confirmación) | ⬜ No cubierto |
| CU-CHAT-02 | Un usuario ajeno al viaje no puede leer ni mandar mensajes de un chat que no le pertenece | Viaje confirmado entre otros dos usuarios, `confirmedTripId` conocido | Con sesión de un tercer usuario, `goto("/chat/<tripId>")` directo | `obtenerChatInicial` regresa `ok:false` → redirige a `/manana` (defensa en profundidad además de la RLS de `trip_messages`/`realtime.messages` en `0010_chat.sql`, que rechazaría el acceso igual si se saltara la página) | 🟡 Media (seguridad) | ⬜ No cubierto |

---

## H. Calificaciones (nueva — ver `docs/diseno_chat_y_calificaciones.md` sección B, decisiones confirmadas 2026-08-27)

| ID | Caso de uso | Precondición | Pasos | Resultado esperado | Prioridad | Automatización |
|---|---|---|---|---|---|---|
| CU-RATE-01 | Tras completarse un viaje, ambas partes pueden calificarse mutuamente desde `/historial` | Viaje `completado` (ver hallazgo E-8 sobre cómo forzar el estado en pruebas) | `/historial` → tarjeta del viaje → `#estrella-<n>-<tripId>` → `#calificar-enviar-<tripId>` | Aparece en modo lectura con las estrellas elegidas; `profiles.rating_avg`/`rating_count` de la contraparte se actualiza (visible como `RatingBadge` en `/manana`/`/historial` la próxima vez que se cargan) | 🔴 Alta (funcionalidad nueva) | ⬜ No cubierto |
| CU-RATE-02 | No se puede calificar un viaje que sigue `programado` | Viaje confirmado pero todavía no completado | Intentar `calificarViaje(confirmedTripId, ...)` sobre ese viaje (vía UI no debería ni ser posible — `CalificarForm` solo se renderiza para `status === "completado"` — o llamando la Server Action directo) | `{ error: "Solo puedes calificar viajes ya completados." }` (RLS también lo rechazaría: la política de insert exige `ct.status = 'completado'`) | 🟡 Media (seguridad/defensa en profundidad) | ⬜ No cubierto |
| CU-RATE-03 | Un usuario puede editar una calificación ya puesta | CU-RATE-01 ya ejecutado | `/historial` → `#calificar-editar-<tripId>` → cambiar estrellas/comentario → `#calificar-enviar-<tripId>` | La calificación se sobrescribe (upsert), y `rating_avg`/`rating_count` de la contraparte se recalcula con el nuevo valor | 🟡 Media | ⬜ No cubierto |
| CU-RATE-04 | "Este viaje no se realizó" cuenta como calificación para desbloquear, pero no afecta el promedio de nadie | Viaje `completado` sin calificar | `/historial` → `#no-realizado-<tripId>` → `#calificar-enviar-<tripId>` | Se guarda con `no_show = true`, `stars = null`; `rating_count`/`rating_avg` de la contraparte NO cambian (el trigger de agregado usa `count(stars)`, que ignora nulls) | 🟡 Media | ⬜ No cubierto |
| CU-RATE-05 | Bloqueo real: no se puede publicar, unirse desde el feed, ni elegir un candidato mientras haya un viaje completado sin calificar | Un viaje `completado` sin calificar por el usuario actual | `/reserva` (debe mostrar la tarjeta de bloqueo, no el formulario); si de todas formas se llama `crearOferta`/`unirmeAViaje`/`elegirCandidato` directo, deben regresar `{ error: MENSAJE_BLOQUEO_SIN_CALIFICAR }` | Ningún viaje nuevo se crea hasta calificar (o marcar no-show) todos los pendientes | 🔴 Alta (es la pieza que hace "obligatoria" la calificación) | ⬜ No cubierto |
| CU-RATE-06 | Anti-colusión: un mismo par de usuarios no puede tener más de 2 viajes confirmados el mismo día | Ya existen 2 `confirmed_trips` entre el mismo `driver_id`/`passenger_id` con `scheduled_time` el mismo día (CDMX) | Un tercer `responderSolicitud(..., "aceptar")` entre el mismo par ese día | El insert en `confirmed_trips` falla con el mensaje del trigger `limitar_viajes_confirmados_por_dia` (`0011_calificaciones.sql`) — `responderSolicitud` lo relaya como `{ error: "No se pudo aceptar la solicitud: ..." }` | ⚪ Baja (defensa contra abuso, no un flujo normal) | ⬜ No cubierto |

Nota: los badges de calificación (`RatingBadge`) hoy solo se muestran en `/manana` y `/historial` (pantallas post-match, donde `profiles` ya es legible vía la política `"select matched profile"`). Mostrarlos en el feed del home y en `/consultar` (pre-match) queda pendiente — requiere extender `find_driver_offers_near`/`find_candidate_offers` (`0002`/`0003_matching_helpers.sql`) para que también regresen `rating_avg`/`rating_count`, ver `docs/diseno_chat_y_calificaciones.md` sección B.4 punto 1.

---
