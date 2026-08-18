# Guion de demo para inversionistas — WEPOOL

**Objetivo:** que un inversionista vea, en menos de 10 minutos, el problema, la solución funcionando de extremo a extremo, y el modelo de negocio — sin que la mecánica de la demo (login, esperar correos, etc.) le reste tiempo a la conversación real.

**Relacionado:** [`producto.md`](./producto.md) (pitch completo y modelo de negocio), [`PROGRESS.md`](../PROGRESS.md) (estado técnico y notas operativas del seed/E2E).

---

## 0. Antes de la demo (checklist operativo)

Esto ya está documentado en `README.md`, se repite aquí para que el guion sea autosuficiente:

1. **Correr `npm run seed` el día antes de la demo** (no antes — los viajes del seed siempre son "para mañana"). Esto llena la app con una comunidad ITAM de ejemplo: 8 usuarios reales de zonas de CDMX (Santa Fe, Interlomas, Del Valle, Coyoacán), 2 parejas ya confirmadas (para que `/manana` y `/historial` no se vean vacíos al abrir la demo) y 2 sin emparejar todavía (para mostrar el emparejamiento en vivo).
2. **Reiniciar el servidor** (`npm run dev`, no solo confiar en hot-reload) y confirmar que carga bien antes de que llegue el inversionista.
3. Si la demo es contra el deploy real de Vercel (recomendado — es lo que va a ver el inversionista si le compartes un link después), correr una vez `PLAYWRIGHT_BASE_URL=https://<tu-dominio> npm run test:e2e` para confirmar que el flujo completo pasa ahí también, no solo en local.
4. Tener a la mano la contraseña de demo que imprime `npm run seed` al final, y decidir de antemano **con qué 2 usuarios vas a hacer login en vivo** (uno como conductor, uno como pasajero) — sugerencia: usa una de las 2 parejas *sin emparejar todavía* del seed, para que el emparejamiento en el paso 4 sea real y en vivo, no algo que ya estaba confirmado de antes.
5. **Nota de privacidad a tener presente tú, no para decir en voz alta**: la app no muestra el nombre de la contraparte en `/consultar` a propósito — solo rol/dirección/hora/precio. Si vas a hacer clic en vivo, fíjate en qué tarjeta le das clic para no confundirte de candidato.

---

## 1. Apertura — el problema (30–45 seg)

No abras con la app. Abre con el problema, en una frase:

> "Todos los días, mucha gente de una misma universidad o empresa hace exactamente el mismo trayecto, sola, en su propio auto — y las apps que existen para compartir ese viaje (Uber, Didi) están diseñadas para que sea el ingreso principal de alguien, no un ingreso marginal por un viaje que ya iba a pasar. Eso hace que el precio nunca pueda bajar lo suficiente. WEPOOL resuelve eso conectando gente de la misma institución."

(Ver `producto.md` sección 2 para la versión larga si el inversionista pide más contexto aquí.)

---

## 2. Login / registro (1 min)

- Entra a `/login` con una cuenta ya existente del seed (no hagas un registro nuevo en vivo — depende de un correo real y de que llegue a tiempo, es el paso con más riesgo de que algo tarde frente al inversionista).
- Punto a decir mientras cargas: **"El registro es solo con correo institucional — verificamos que la organización ya esté dada de alta en WEPOOL antes de dejar entrar a alguien."** (texto real de `/registro`: *"verificamos que tu empresa u organización ya esté dada de alta en WEPOOL"*).
- Si quieres mostrar el registro real sin depender de un correo en vivo, puedes mencionarlo verbalmente y mostrar la pantalla `/registro` sin enviarla, en vez de completar el flujo.

---

## 3. Publicar un viaje (`/reserva`) — 1.5 min

Con el usuario ya logueado:

1. Muestra el toggle **Conductor / Pasajero** y **Ida al ITAM / Regreso del ITAM** — señala que un mismo formulario cubre los 4 casos (conductor/pasajero × ida/regreso), lo cual reflejaba las 4 tablas separadas de la tesina original consolidadas en un solo flujo.
2. Llena una dirección real (usa una de las zonas del seed — Santa Fe, Interlomas, Del Valle, Coyoacán — para que el emparejamiento del paso 4 encuentre candidatos reales) y publica.
3. Cuando aparezca **"¡Viaje publicado!"**, aprovecha para decir la línea de negocio:
   > "Este mismo formulario, del lado del conductor, es literalmente cómo alguien empieza a ganar dinero con un trayecto que de todos modos iba a hacer."

---

## 4. Emparejamiento y confirmación (`/consultar`) — 2–3 min — el corazón de la demo

Este es el paso que más vale la pena que se vea "vivo", no pre-armado:

1. Cambia a la cuenta de la contraparte (pasajero si publicaste como conductor, o viceversa) y publica un viaje compatible (misma zona, hora cercana).
2. Entra a `/consultar` — aquí debería aparecer al menos un candidato real (el que acabas de publicar) y potencialmente varios más si coinciden con horarios del seed. **Esto es una buena señal, no un error**: muestra que el emparejamiento funciona con una comunidad real, no solo con dos usuarios de juguete armados para la demo.
3. Señala lo que se muestra de cada candidato — rol, dirección, hora, y el precio/ganancia estimado (`Badge` verde) — y explica el número:
   > "Este precio no es arbitrario — sale de una fórmula real: tarifa base más un costo por kilómetro, con una comisión del 15% para la plataforma. El conductor se queda con el resto." (cifras exactas en `producto.md`, sección 4, por si preguntan el detalle)
4. Haz clic en **"Elegir este viaje"** desde el lado del pasajero, y luego confirma del lado del conductor — señala que la confirmación es mutua, no unilateral.
5. Punto de cierre de este bloque: **"Todo este flujo — publicar, emparejar, confirmar — está cubierto por una suite de pruebas automatizadas que corre contra la base de datos real antes de cada demo, no solo probado a mano."** (da confianza técnica sin entrar en detalle de Playwright a menos que pregunten).

---

## 5. `/manana` y `/historial` (1 min)

- `/manana`: el viaje recién confirmado ya aparece aquí para ambos usuarios — refuerza que no quedó "a medias", el compromiso es real para el día siguiente.
- `/historial`: muestra las 2 parejas ya confirmadas por el seed, para dar sensación de una comunidad con actividad recurrente, no solo el viaje que acabas de armar en vivo.

---

## 6. Cierre — modelo de negocio y ask (1–2 min)

Recapitula en una frase y aterriza el pitch comercial:

> "El ITAM es donde nació esto, pero el negocio es venderle esto a cualquier institución que quiera ofrecérselo a su gente — cada institución nueva es, literalmente, agregar una fila de configuración, no reescribir la app."

Cierra con el ask concreto. **[Pendiente de definir junto con el fundador antes de la demo real: monto que se busca, uso de fondos, y qué milestone destraba con esa inversión — no improvisar esto en vivo.]**

---

## Preguntas frecuentes de inversionistas — cómo responder

| Pregunta probable | Respuesta corta | Detalle en |
|---|---|---|
| "¿Ya cobran de verdad?" | No todavía — el precio que se ve es una estimación real de la fórmula de negocio, pero el cobro (Stripe) es el siguiente paso, no algo ya validado con dinero real. Ser directo con esto, no minimizarlo. | `producto.md` §4, §8 |
| "¿Cómo saben que el conductor es confiable?" | Hoy, solo verificación de correo institucional — no hay verificación de licencia ni calificaciones todavía. Es una pregunta abierta real del roadmap, no algo ya resuelto. | `producto.md` §8, §11 |
| "¿Por qué no compite Uber con esto directamente?" | Uber depende de que el conductor cobre su ingreso principal — no puede bajar el precio a este nivel sin canibalizar su propio modelo. WEPOOL nace pensado específicamente para el caso de "ya iba a hacer este viaje". | `producto.md` §4, §6 |
| "¿Qué tan grande es el mercado?" | Honesto: **[pendiente de definir]** — no inventar una cifra en vivo si no está en `producto.md` §5. Mejor decir "lo estamos dimensionando institución por institución" que dar un número sin sustento. | `producto.md` §5 |
| "¿Qué pasa si en una institución hay pocos usuarios?" | El emparejamiento depende de densidad *dentro* de cada institución — es una limitación real reconocida, no oculta. | `producto.md` §11 |

---

## Notas de timing

Total estimado: **7–10 minutos** de demo + tiempo de preguntas. Si el tiempo es corto, los pasos recortables primero son 2 (login, se puede narrar sin mostrarlo completo) y 5 (`/historial` se puede omitir si ya se vio `/manana`) — nunca recortar el paso 4, es el que demuestra que el producto funciona de verdad.
