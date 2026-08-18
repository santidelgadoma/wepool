# Documentación de producto — WEPOOL

**Estado:** MVP funcional, pendiente de pulir para demo con inversionistas (ver `PROGRESS.md`)
**Última actualización:** 18 de agosto de 2026
**Relacionado:** [`arquitectura_mvp.md`](./arquitectura_mvp.md) (decisiones técnicas), [`esquema_base_datos.md`](./esquema_base_datos.md) (esquema), [`guion_demo.md`](./guion_demo.md) (narrativa para la demo en vivo), [`PROGRESS.md`](../PROGRESS.md) (bitácora de desarrollo)

> **Nota sobre este documento:** es la primera vez que el pitch/modelo de negocio (que hasta ahora vivía disperso en `PROGRESS.md` como notas de contexto para decisiones de código) se documenta como producto en sí. Donde no hay un dato real todavía (tamaño de mercado, cifras de competencia, monto de ronda), lo marco explícitamente como **[pendiente de definir]** en vez de inventar un número — mejor completarlo con datos reales antes de usarlo frente a un inversionista.

---

## 1. Resumen ejecutivo

WEPOOL es una app de carpool institucional: conecta a personas de una misma institución (universidad, empresa) que hacen trayectos parecidos todos los días, para que compartan el viaje. El conductor gana un ingreso marginal por un trayecto que de todos modos iba a hacer; el pasajero paga mucho menos que un viaje por app tradicional (Uber/Didi), porque no está pagando el ingreso principal de nadie — solo una fracción del costo de un viaje que ya estaba sucediendo.

El ITAM es el primer cliente/piloto, pero el producto no está limitado a una universidad: el modelo comercial es venderlo como servicio a cualquier institución que quiera ofrecer esto a su comunidad.

---

## 2. El problema

- Ir todos los días a la misma institución (universidad, oficina) en auto propio es caro (gasolina, estacionamiento, desgaste) y muchas veces con asientos vacíos.
- Las alternativas actuales no resuelven bien esto:
  - **Uber/Didi**: el conductor cobra su ingreso principal por manejar, así que el precio no puede bajar mucho — no está pensado para alguien que de todos modos iba a hacer ese trayecto.
  - **Grupos de WhatsApp / coordinación informal**: existen en la práctica (columnas de "¿alguien va a Santa Fe?"), pero no tienen emparejamiento real, no verifican que la otra persona sea de la misma institución, y dependen de que alguien se acuerde de contestar a tiempo.
- El proyecto parte de una tesina del ITAM (*"Diseño e implementación de un prototipo de una aplicación para impulsar la cultura de transporte compartido dentro de una universidad"*, 2025) que valida que el problema y la necesidad existen dentro de una comunidad universitaria real — el MVP actual reconstruye esa idea con arquitectura de producto real (Next.js + Supabase) en vez de un prototipo académico.

---

## 3. La solución — cómo funciona

Un usuario con correo institucional válido (ej. `@itam.mx`) puede, el mismo día, ser conductor u ofrecerse como pasajero, para el trayecto de ida o de regreso:

1. **Registro/login** con correo institucional — solo gente verificablemente de la institución puede usar la app (confianza de comunidad cerrada, no una app abierta a desconocidos).
2. **Publicar un viaje** (`/reserva`): como conductor (con datos del vehículo) o como pasajero, especificando dirección y hora.
3. **Emparejamiento geoespacial** (`/consultar`): el sistema busca candidatos compatibles por cercanía de ruta y ventana de tiempo (usando PostGIS — ver `arquitectura_mvp.md`), y muestra rol, dirección, hora y precio/ganancia estimados de cada candidato (sin revelar identidad todavía, por privacidad).
4. **Confirmación mutua**: el pasajero elige un viaje/conductor, el conductor confirma al pasajero (o viceversa) — el viaje queda cerrado para ambos.
5. **`/manana`**: los viajes confirmados para el día siguiente, para que ambas partes sepan qué esperar.
6. **`/historial`**: viajes ya realizados.
7. **`/cancelar`**: cancelar una reservación activa antes de que se confirme.

---

## 4. Modelo de negocio

**Tipo de modelo:** marketplace de dos lados, con comisión sobre transacción (take rate) — WEPOOL no cobra a la institución por usar la app (o [pendiente de definir] si eventualmente se cobra una licencia B2B por comunidad), cobra un porcentaje de cada viaje.

**Fórmula de precio actual** (`lib/pricing.ts`, usada ya en `/consultar`, `/manana` e `/historial`):

| Componente | Valor |
|---|---|
| Tarifa base | $10 MXN |
| Tarifa por km | $3.5 MXN/km |
| Comisión de la plataforma | 15% (sobre lo que paga el pasajero) |
| Redondeo | al múltiplo de $5 MXN más cercano |

Ejemplo: un trayecto de 8 km → precio al pasajero ≈ $10 + 3.5×8 = $38 → redondeado a **$40 MXN**; ganancia del conductor ≈ $40 × 0.85 = $34 → redondeado a **$35 MXN**; ingreso de la plataforma ≈ **$5 MXN** por viaje.

**Por qué esto es más barato que Uber/Didi:** en un viaje por app tradicional, el precio tiene que cubrir el ingreso completo del conductor (es su trabajo). Aquí el conductor ya iba a hacer el trayecto — lo que gana es una ganancia marginal, no un sueldo. Eso permite que el precio al pasajero sea sustancialmente menor sin que la plataforma deje de ganar por volumen. **[Pendiente de definir: comparar con un precio real de Uber/Didi para el mismo trayecto en CDMX, para poner el ahorro en un número concreto frente a un inversionista — no hay una cotización real todavía en este documento.]**

**Aún no implementado:** no hay cobro real todavía (ni Stripe ni ningún procesador) — el precio se muestra como estimación informativa en la app, pero el dinero no se mueve dentro de la plataforma. Esto es explícitamente Fase 4/5+ en `PROGRESS.md`. Antes de cualquier conversación de inversión seria, vale la pena ser explícito con el inversionista de que las unit economics de arriba son un modelo, no datos observados con dinero real.

---

## 5. Mercado y estrategia de expansión

- **No es un producto solo para el ITAM.** El ITAM es el primer cliente/piloto porque es donde nació el proyecto (tesina) y porque el fundador tiene acceso directo a esa comunidad para validar el producto — pero el pitch de comercialización es venderlo como servicio a cualquier institución (universidad, empresa, campus corporativo) que quiera ofrecerle esto a su gente.
- **Modelo de entrada institución por institución:** cada institución nueva es, en esencia, un mercado de dos lados propio y cerrado (solo gente de esa institución se empareja entre sí) — el efecto de red importa dentro de cada comunidad, no entre comunidades. Eso hace que el producto escale por *número de instituciones* más que por crecimiento orgánico viral entre usuarios individuales de instituciones distintas.
- Técnicamente ya soporta esto: el dominio de correo permitido no está hardcodeado a `@itam.mx`, vive en una tabla `institutions` (`supabase/migrations/0004_instituciones.sql`) — agregar una institución nueva es una fila de configuración, no un cambio de código.
- **Tamaño de mercado, ritmo de expansión esperado, y siguientes instituciones objetivo:** **[pendiente de definir]** — buen siguiente paso antes de hablar con inversionistas es tener aunque sea una lista corta de 3-5 instituciones candidatas (otras universidades privadas en CDMX, o empresas con campus grandes) con una razón concreta de por qué cada una es un buen segundo cliente.

---

## 6. Diferenciadores competitivos

| Frente a... | Diferenciador de WEPOOL |
|---|---|
| Uber / Didi | Precio mucho menor porque el ingreso del conductor es marginal, no su sueldo; comunidad cerrada y verificada (correo institucional) en vez de desconocidos |
| Grupos de WhatsApp / coordinación informal | Emparejamiento automático por geografía y hora real (PostGIS), no depender de que alguien vea el mensaje a tiempo; historial y confirmación formal del viaje |
| Otras apps de carpool genéricas (BlaBlaCar y similares) | Enfoque institucional: todos los usuarios pertenecen a la misma organización, lo cual da una capa de confianza y relevancia (rutas/horarios) que una app abierta a cualquier persona no tiene |

---

## 7. Estado actual del producto (por pantalla)

| Pantalla | Función | Estado |
|---|---|---|
| `/login`, `/registro` | Autenticación con correo institucional, verificación por link mágico | Funcional |
| `/home` | Dashboard con accesos rápidos a las demás pantallas | Funcional |
| `/reserva` | Publicar viaje (conductor/pasajero × ida/regreso), con geocoding real de dirección | Funcional (geocoding con Nominatim, temporal — ver sección 8) |
| `/consultar` | Emparejamiento geoespacial y confirmación mutua de viaje | Funcional |
| `/manana` | Viajes confirmados para el día siguiente | Funcional |
| `/historial` | Viajes ya realizados | Funcional |
| `/cancelar` | Cancelar una reservación activa | Funcional |

Todo el flujo de extremo a extremo (publicar → emparejar → confirmar → aparecer en "mañana") está cubierto por una suite de pruebas automatizadas (Playwright) que corre contra el proyecto real de Supabase — ver `PROGRESS.md`, Fase 5.

Identidad de marca (WEPOOL: logo, paleta de color, nombre) y pulido visual (iconos, badges, navegación) en las 8 pantallas: completado el 18 de agosto de 2026 — ver `PROGRESS.md`.

**Instalable como app (PWA)** — se puede agregar a la pantalla de inicio en iOS/Android/desktop y abrir en pantalla completa, sin barra de navegador, con ícono propio. Ver sección 12.

---

## 8. Lo que falta antes de escalar (Fase 4 y más allá)

- **Cobro real** (Stripe u otro procesador) — hoy el precio es solo informativo, no se mueve dinero. Es el bloqueador más importante antes de operar con usuarios reales fuera de una demo.
- **Google Distance Matrix real** — hoy la duración del trayecto se estima con una velocidad promedio fija (`VELOCIDAD_PROMEDIO_KMH = 22`), no con tráfico real. Afecta tanto el emparejamiento fino como el precio mostrado.
- **Geocoding con Google** en vez de OpenStreetMap Nominatim (solución temporal gratuita) — mejor calidad de datos de dirección para CDMX.
- **Integración con Google Calendar** al confirmar un viaje.
- **Recordatorios por correo** (Resend) — hoy no hay ningún recordatorio automático del viaje del día siguiente.
- **Verificación de identidad/confianza del conductor** — el producto depende de que "correo institucional" sea suficiente señal de confianza. Para escalar más allá de una comunidad pequeña, probablemente haga falta algo más (verificación de licencia de conducir, calificación entre usuarios, reporte de incidentes). **No está en el roadmap actual y vale la pena decidir conscientemente si es un requisito antes de operar con dinero real.**

---

## 9. Roadmap sugerido

**Corto plazo (0–3 meses) — validar con el ITAM real:**
- Cerrar los pendientes críticos de Fase 4/5 antes de una demo en vivo con inversionistas (ver `PROGRESS.md`).
- Correr una demo/piloto real con estudiantes del ITAM (no solo datos de seed) para obtener las primeras señales reales de uso.
- Definir y trackear las métricas de la sección 10 desde el día uno del piloto real.

**Mediano plazo (3–6 meses) — primeras transacciones reales:**
- Integrar cobro real (Stripe) y validar las unit economics de la sección 4 con dinero real, no solo estimado.
- Elegir y arrancar el segundo cliente/institución piloto.

**Largo plazo (6–12 meses) — [pendiente de definir con el fundador]:**
- ¿Ronda de inversión? ¿monto objetivo y uso de fondos?
- ¿Expansión a cuántas instituciones, en qué ciudades?
- Si el volumen lo justifica, evaluar una app nativa real (ver sección 12) — hoy no es necesaria.

---

## 10. Métricas clave a trackear (una vez operando con usuarios reales)

- **Viajes publicados vs. confirmados** — tasa de conversión del emparejamiento (¿la oferta encuentra pareja?).
- **GMV** (volumen total pagado por pasajeros) e **ingreso de la plataforma** (15% de eso).
- **Usuarios activos por institución** (WAU/MAU) — importa por institución, no en agregado, porque el efecto de red es local a cada comunidad (ver sección 5).
- **Retención**: ¿la misma pareja conductor-pasajero repite el viaje día tras día? (esperable si es su ruta diaria real — buena señal de retención estructural, no solo de producto).
- **Tiempo entre publicar un viaje y encontrar pareja** — proxy de qué tan líquido es el mercado dentro de cada institución.

---

## 11. Riesgos y preguntas abiertas

- **Dependencia de infraestructura gratuita**: el proyecto de Supabase puede pausarse por inactividad en el plan gratuito — hay que vigilarlo antes de cualquier demo o piloto real, y presupuestar el plan de pago antes de escalar.
- **Unit economics no validadas con dinero real** — la fórmula de precio (sección 4) es un modelo razonado, no datos observados de disposición a pagar real.
- **Confianza y seguridad** — no hay verificación de identidad del conductor más allá del correo institucional (ver sección 8). Es una pregunta que un inversionista probablemente haga directamente.
- **Efecto de red por institución**: el modelo depende de tener suficiente densidad de usuarios *dentro* de cada institución para que el emparejamiento funcione bien — una institución con pocos usuarios activos puede no generar suficientes candidatos. Vale la pena pensar en un número mínimo de usuarios activos por institución para que la experiencia se sienta útil desde el lanzamiento.

---

## 12. ¿App nativa o web? — decisión 2026-08-18

Se evaluaron dos caminos:

- **App nativa** (React Native/Expo, publicada en App Store y Google Play): da acceso a APIs nativas completas (notificaciones push confiables, mejor rendimiento) pero implica un proyecto de desarrollo aparte — otro código base que mantener en paralelo al de la web, cuentas de desarrollador ($99 USD/año en Apple, registro único en Google Play), el proceso de revisión de cada tienda antes de publicar cualquier cambio, y semanas de desarrollo real, no días.
- **PWA (Progressive Web App)**: agregar un manifest, iconos y un service worker mínimo al mismo proyecto Next.js que ya existe. Da la mayor parte del beneficio de "sentirse como app" — ícono en la pantalla de inicio, se abre en pantalla completa sin barra de navegador del sistema, algo de velocidad/resiliencia offline — sin crear un segundo proyecto ni depender de la revisión de ninguna tienda. Se implementa en horas.

**Decisión:** para esta etapa (piloto con una institución, demo a inversionistas, sin tracción todavía) se implementó la ruta PWA — es la que da el mayor beneficio percibido por el menor costo de desarrollo y mantenimiento en este momento. Reevaluar una app nativa si el volumen de uso real llega a un punto donde notificaciones push nativas confiables o rendimiento gráfico avanzado se vuelvan un bloqueador real, no antes.

**Qué se implementó** (ver `PROGRESS.md` para el detalle técnico): `app/manifest.ts` (nombre, iconos, colores de marca), íconos dedicados para instalación (incluye una versión "maskable" para Android, con la mascota dentro de la zona segura para que no se recorte con formas de ícono distintas), y un service worker (`public/sw.js`) que cachea únicamente el "app shell" estático — nunca datos de Supabase (sesión, viajes) — para no arriesgar mostrar información desactualizada. Sin ninguna librería nueva (`next-pwa` y similares no se pudieron instalar en el entorno de trabajo por el bloqueo de npm), usando solo convenciones nativas de Next.js 15.

**Cómo probarlo:** en Chrome/Edge de escritorio, el ícono de "Instalar" aparece en la barra de direcciones; en Android (Chrome), el menú ofrece "Agregar a la pantalla de inicio"; en iOS (Safari), es manual — botón de compartir → "Agregar a inicio" (Apple no expone un prompt automático de instalación para PWAs, a diferencia de Android). No se pudo probar en vivo en este entorno de trabajo (mismo bloqueo de npm/build de siempre) — antes de la demo, instalarla una vez en un celular real para confirmar que el ícono y la pantalla completa se ven bien.
