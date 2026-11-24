# Recepción por WhatsApp · manual de activación

El recepcionista virtual de cada local: atiende por WhatsApp, mira la agenda
de verdad, reserva y apunta en la lista de espera. Es un canal más del mismo
motor que ya atiende el llavero. **No hay una segunda agenda ni una segunda
base de clientes.**

Precio del complemento: **10 €/mes**. Incluye línea, agente, lista de espera,
recordatorios, fidelización, recomendaciones y avatar.

---

## 1. Lo que ve el dueño (tres pasos, sin instalar nada)

1. **Ponle cara y nombre.** Elige avatar, nombre (Nico, Sofía, Lola…),
   personalidad y mensaje de bienvenida. Hay vista previa de cómo lo verá el
   cliente al tocar el llavero.
2. **Conectar WhatsApp.** Un botón. Entra con su cuenta de Meta, elige el
   número y vuelve. La línea nace **en modo prueba**: solo le contesta a él y
   a los números que autorice. Nada de clientes reales hasta que lo pase a
   modo real desde el panel.
3. **Probar.** En la misma pantalla hay una conversación de prueba con su
   agenda real. Es una prueba de verdad, pero con el freno puesto: no escribe
   citas, no toca clientes y no cuenta en las métricas.

Si JULEX todavía no tiene la app de Meta aprobada, el paso 2 dice la verdad
(«aún no está habilitado») y el resto del módulo sigue funcionando en modo
prueba. No se simula una conexión que no existe.

---

## 2. Lo que hay que hacer una sola vez en JULEX

### 2.1 Meta

Los pasos, pantalla por pantalla y con lo que hay que pegar en cada sitio, están
en [`meta-pasos.md`](meta-pasos.md). Aquí va el resumen.

1. Crear una app en [developers.facebook.com](https://developers.facebook.com)
   de tipo **Business** y añadirle el producto **WhatsApp**.
2. Darse de alta como **Tech Provider** (o Solution Partner) para poder dar de
   alta negocios con **Embedded Signup** en su nombre. Sin esto, cada barbería
   tendría que hacer el papeleo entera y no habría «tres clics».
3. Crear una **configuración de Embedded Signup** y apuntar su ID.
4. Comprobar en la documentación de Meta la **política de proveedores de IA**
   antes de comercializar: puede cambiar cómo factura Meta los mensajes que
   genera un agente. Esto es una comprobación de negocio, no de código.

### 2.2 Secretos de las funciones (`supabase secrets set`)

```bash
# El motor (ya existía)
ASISTENTE_LLM_URL=https://api.deepseek.com/v1
ASISTENTE_LLM_KEY=sk-...
ASISTENTE_LLM_MODEL=deepseek-flash

# WhatsApp
WA_APP_SECRET=...        # App Secret de Meta: valida la firma del webhook
WA_VERIFY_TOKEN=...      # una frase larga y aleatoria, la que se pega en Meta
META_APP_ID=...
META_APP_SECRET=...
META_CONFIG_ID=...       # la configuración de Embedded Signup
WA_REDIRECT_URI=https://julex.pages.dev/panel/recepcion

# Cron
CRON_SECRET=...          # el mismo que se guarda en config_secreta
```

Sin `ASISTENTE_LLM_KEY` todo funciona en «modo prueba» y no gasta nada.
Sin `WA_APP_SECRET` el webhook **no comprueba la firma**: no lo dejes así en
producción, cualquiera que descubriera la URL podría inventarse mensajes.

### 2.3 Webhook

En Meta, el webhook de WhatsApp apunta a:

```
https://<proyecto>.supabase.co/functions/v1/wa-webhook
```

Token de verificación: el mismo `WA_VERIFY_TOKEN`. Suscríbete solo al campo
`messages` (y `message_status` si quieres los ticks).

### 2.4 Plantilla de recordatorio

Los recordatorios se mandan con una **plantilla de utilidad** (fuera de la
ventana de 24 h no se puede escribir texto libre). El nombre está fijado en
`supabase/functions/wa-cron/index.ts`:

- Nombre: `recordatorio_cita`
- Idioma: `es`
- Cuerpo con cuatro variables, en este orden: `{{1}}` nombre de pila,
  `{{2}}` servicio, `{{3}}` día y hora, `{{4}}` nombre del local.

Propuesta de texto:

> Hola {{1}}, te esperamos el {{3}} para {{2}} en {{4}}. Si no puedes venir,
> respóndeme por aquí y lo cambiamos.

Se da de alta **una vez por cuenta de WhatsApp** (por negocio), porque Meta
las aprueba por WABA. Las de utilidad suelen aprobarse en minutos.

### 2.5 Cron

En el editor SQL del proyecto, una vez:

```sql
insert into config_secreta (clave, valor) values
  ('wa_cron_url', 'https://<proyecto>.supabase.co/functions/v1/wa-cron'),
  ('wa_cron_secreto', '<el mismo CRON_SECRET>')
on conflict (clave) do update set valor = excluded.valor;
```

La migración `0036_cron_whatsapp.sql` programa el trabajo cada cinco minutos
si `pg_cron` y `pg_net` están disponibles. Si no lo están, el propio SQL lo
avisa y se puede llamar a mano:

```bash
curl -X POST https://<proyecto>.supabase.co/functions/v1/wa-cron \
  -H "x-julex-cron: $CRON_SECRET"
```

### 2.6 Migraciones

```bash
supabase db push      # aplica 0031 a 0036
supabase functions deploy wa-webhook wa-cron wa-onboarding wa-simular asistente
```

Las funciones de WhatsApp importan el motor desde `../asistente/` y los
compartidos desde `../_shared/`. El empaquetador de la CLI sigue esas rutas
relativas; si en el futuro se prefiere lo canónico, basta mover `engine.ts`,
`prompt.ts`, `herramientas.ts` y `turno.ts` a `_shared/` y ajustar imports.

---

## 3. Cómo funciona por dentro

```
Cliente                 Meta                  wa-webhook              Base de datos
   │  "hola"              │                       │                        │
   ├─────────────────────►│                       │                        │
   │                      ├──────────────────────►│ firma + dedupe         │
   │                      │                       ├───────────────────────►│ wa_mensaje
   │                      │                       │ wa_publico(telefono)   │
   │                      │                       ├───────────────────────►│ ficha, sellos, espera
   │                      │                       │ ejecutarTurno()        │
   │                      │                       │  huecos / reservar …   │
   │                      │◄──────────────────────┤ enviarTexto            │
   │◄─────────────────────┤                       │                        │
```

- **Quién es:** el número de WhatsApp lo verifica Meta. Si ese número está en
  una ficha del local, se vincula solo. Si no, el agente atiende como cliente
  nuevo y, si dice que ya lo es, le manda un código de 6 cifras para enlazar.
- **Qué puede hacer:** sale de `asistente_config.funciones`. Si un interruptor
  está apagado, la herramienta **no se le ofrece al modelo**. No es una
  instrucción en el prompt: es que no existe.
- **Precios y horas:** siempre por herramienta, contra la agenda real. El
  agente no puede inventar un hueco porque `reservar` vuelve a comprobar el
  hueco antes de escribir.
- **Doble reserva:** imposible por construcción. La cita ocupa el hueco en el
  mismo instante en que se crea; el «modo estreno» solo decide quién la
  confirma.
- **Repeticiones:** cada mensaje de Meta tiene un identificador único. Si Meta
  reintenta el webhook, el segundo intento no se procesa.

---

## 4. Costes y topes

| Concepto | Qué cuesta |
|---|---|
| Mensajes de servicio (los del agente contestando) | Meta da **1.000 gratis al mes por número**; una barbería normal no llega |
| Plantillas de utilidad (recordatorios) | Unos céntimos cada una. Es el único gasto de mensajería real |
| IA | Céntimos: cada turno suma tokens y coste en `asistente_conversacion` |
| Línea | El número de recepción (segundo número, no el personal del dueño) |

Topes por local y mes, ya programados y visibles en el panel:

- **300 conversaciones**
- **1.500 mensajes**
- 60 mensajes por cliente y 24 h, 30 por conversación

Si un local se pasa, el agente deja de contestar y el dueño lo ve en el panel.
A 10 €/mes, el tope no es una limitación comercial: es la única forma de que
el complemento no pierda dinero con el cliente que más lo usa.

---

## 5. Datos y privacidad

- El local es el **responsable** del tratamiento; JULEX es el **encargado**.
  Hace falta contrato de encargo (art. 28 RGPD) con cada negocio.
- Solo se guarda lo necesario: teléfono, mensajes y las citas que se crean.
  Los mensajes se borran a los **90 días** (`limpiar_whatsapp()`); los códigos,
  a la hora.
- Los recordatorios solo se mandan a clientes con `cons_avisos` activo.
- El agente se presenta como asistente virtual en el primer mensaje.
- Un cliente puede desvincular su teléfono: `wa_desvincular()`. La ficha se
  queda; lo que se va es el acceso desde ese número.

---

## 6. Pruebas

```bash
npm run test:whatsapp   # 64 comprobaciones del canal: firma, sobres, herramientas, prompt
npm run test:esquema    # 192 comprobaciones sobre un Postgres real, incluidas las 6 migraciones nuevas
npm run test:asistente  # el motor de siempre
npm run typecheck
```

`test:whatsapp` comprueba la firma contra la implementación de Node, no contra
sí misma. `test:esquema` levanta Postgres en memoria y prueba el flujo entero:
vínculo por teléfono, código, deduplicación, oferta de hueco al cancelar,
recordatorio reclamado una sola vez, aprobación del dueño y aislamiento entre
locales.

---

## 7. Audios e imágenes: no

**No se transcriben audios.** Es una decisión de producto, no una tarea
pendiente:

- Hace falta un **proveedor de voz aparte** —el modelo del agente escribe,
  no escucha— y eso es un tercero más procesando datos personales.
- Cuesta por minuto y su consumo es difícil de acotar por local.
- Y no resuelve un problema que el local tenga: quien escribe por WhatsApp,
  escribe. Quien manda un audio es porque le es más cómodo, y con una frase
  se le pide que lo haga por escrito.

Lo que sí hace el agente: cuando llega un audio o una imagen, contesta con
naturalidad que eso no lo puede leer y que se lo escriban. Nunca finge que lo
ha entendido.

El resto de límites, hoy:

- **Multilínea.** Un número por local. Dos números en el mismo local no está
  contemplado.
- **Facturación del complemento.** El precio está en el panel; el cobro de los
  10 € va por la suscripción, no hay línea separada en Stripe todavía.
- **Autorizar números en modo prueba**: se hace desde el panel, en el mismo
  bloque del número, con un botón por número.

## 8. Cómo se enciende y se apaga

| Palanca | Dónde | Qué hace |
|---|---|---|
| `canal_whatsapp` | Panel → Conectar / Desconectar | Enciende o apaga el canal entero |
| `wa_linea.modo` | Panel → «Atender a todos mis clientes» | Pasa de prueba (solo el dueño) a real (todo el mundo) |
| `funciones.*` | Panel → Qué puede hacer | Apaga una capacidad concreta |
| `funciones.aprobacion` | Panel → «Confirmar yo las citas» | El dueño confirma cada cita desde WhatsApp |
| `desconectar` | Panel → Desconectar | Pausa la línea y borra el token de Meta |

Con `aprobacion` encendida, la cita **ocupa su hueco desde el primer
momento** y el dueño recibe dos botones: «Confirmar» o «No puede ser». Al
confirmar, el cliente recibe el aviso en el mismo hilo. El hueco nunca se
queda doble.
